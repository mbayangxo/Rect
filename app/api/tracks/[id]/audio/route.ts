import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { TRACKS_BUCKET } from "@/lib/tracks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const ALLOWED_AUDIO = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
]);

type Params = { params: Promise<{ id: string }> };

function storagePathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const marker = `/object/public/${TRACKS_BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx >= 0) {
      return decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
    }
    const alt = `/storage/v1/object/public/${TRACKS_BUCKET}/`;
    const altIdx = url.indexOf(alt);
    if (altIdx >= 0) {
      return decodeURIComponent(url.slice(altIdx + alt.length).split("?")[0]);
    }
  } catch {
    return null;
  }
  return null;
}

function safeExt(name: string, mime: string) {
  const fromName = name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) {
    return "m4a";
  }
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("webm")) return "webm";
  return "mp3";
}

/** Artist replaces the playable audio file for their own track (keeps track id). */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const trackId = id?.trim();
  if (!trackId) {
    return NextResponse.json({ error: "Track id required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "Server missing SUPABASE_SERVICE_ROLE_KEY — cannot replace audio.",
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data." },
      { status: 400 },
    );
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json(
      { error: "Audio file is required." },
      { status: 400 },
    );
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: "Audio file must be under 50MB." },
      { status: 400 },
    );
  }
  const mime = audio.type || "audio/mpeg";
  if (mime && !ALLOWED_AUDIO.has(mime) && !mime.startsWith("audio/")) {
    return NextResponse.json(
      { error: `Unsupported audio type: ${mime}` },
      { status: 400 },
    );
  }

  const durationRaw = String(form.get("duration_secs") ?? "").trim();
  const durationParsed = durationRaw ? Number(durationRaw) : NaN;
  const duration_secs =
    Number.isFinite(durationParsed) &&
    durationParsed > 0 &&
    durationParsed <= 7200
      ? Math.round(durationParsed)
      : null;

  const { data: existing, error: findError } = await supabase
    .from("tracks")
    .select("id, artist_id, audio_url")
    .eq("id", trackId)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Track not found." }, { status: 404 });
  }
  if (existing.artist_id !== user.id) {
    return NextResponse.json({ error: "Not your track." }, { status: 403 });
  }

  const ext = safeExt(audio.name || "track.mp3", mime);
  const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await audio.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from(TRACKS_BUCKET)
    .upload(path, buffer, {
      contentType: mime || "audio/mpeg",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Audio upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { data: pub } = admin.storage.from(TRACKS_BUCKET).getPublicUrl(path);
  const audio_url = pub.publicUrl;

  const patch: Record<string, unknown> = { audio_url };
  if (duration_secs != null) patch.duration_secs = duration_secs;

  let data: Record<string, unknown> | null = null;
  let error: { message: string } | null = null;

  {
    const result = await supabase
      .from("tracks")
      .update(patch)
      .eq("id", trackId)
      .eq("artist_id", user.id)
      .select("id, audio_url, duration_secs, title")
      .maybeSingle();
    data = result.data as Record<string, unknown> | null;
    error = result.error;
  }

  if (
    error &&
    duration_secs != null &&
    /duration_secs|column .* does not exist/i.test(error.message)
  ) {
    const lean = await supabase
      .from("tracks")
      .update({ audio_url })
      .eq("id", trackId)
      .eq("artist_id", user.id)
      .select("id, audio_url, title")
      .maybeSingle();
    data = lean.data as Record<string, unknown> | null;
    error = lean.error;
  }

  if (error || !data) {
    await admin.storage.from(TRACKS_BUCKET).remove([path]);
    return NextResponse.json(
      { error: error?.message || "Could not update track audio." },
      { status: 500 },
    );
  }

  const oldPath = storagePathFromPublicUrl(
    existing.audio_url as string | null,
  );
  if (oldPath && oldPath !== path) {
    await admin.storage.from(TRACKS_BUCKET).remove([oldPath]);
  }

  return NextResponse.json({
    ok: true,
    track: data,
    audio_url,
    duration_secs:
      typeof data.duration_secs === "number" ? data.duration_secs : duration_secs,
  });
}
