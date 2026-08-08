import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { TRACKS_BUCKET } from "@/lib/tracks";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
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
const ALLOWED_COVER = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

async function ensureTracksBucket(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
) {
  const { data: buckets } = await admin.storage.listBuckets();
  const exists = buckets?.some((b) => b.id === TRACKS_BUCKET || b.name === TRACKS_BUCKET);
  if (exists) return;

  const { error } = await admin.storage.createBucket(TRACKS_BUCKET, {
    public: true,
    fileSizeLimit: MAX_AUDIO_BYTES,
    allowedMimeTypes: [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
      "audio/mp4",
      "audio/aac",
      "audio/ogg",
      "audio/webm",
      "image/jpeg",
      "image/png",
      "image/webp",
    ],
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Could not create storage bucket: ${error.message}`);
  }
}

function safeExt(name: string, mime: string) {
  const fromName = name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("aac") || mime.includes("mp4")) return "m4a";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  return "mp3";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "Server missing SUPABASE_SERVICE_ROLE_KEY — cannot upload audio safely.",
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const title = String(form.get("title") ?? "").trim();
  const genre = String(form.get("genre") ?? "").trim() || null;
  const audio = form.get("audio");
  const cover = form.get("cover");

  if (title.length < 1 || title.length > 120) {
    return NextResponse.json(
      { error: "Title must be 1–120 characters." },
      { status: 400 },
    );
  }
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
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

  let coverFile: File | null = null;
  if (cover instanceof File && cover.size > 0) {
    if (cover.size > MAX_COVER_BYTES) {
      return NextResponse.json(
        { error: "Cover image must be under 5MB." },
        { status: 400 },
      );
    }
    const coverMime = cover.type || "image/jpeg";
    if (!ALLOWED_COVER.has(coverMime) && !coverMime.startsWith("image/")) {
      return NextResponse.json(
        { error: `Unsupported cover type: ${coverMime}` },
        { status: 400 },
      );
    }
    coverFile = cover;
  }

  try {
    await ensureTracksBucket(admin);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bucket setup failed" },
      { status: 500 },
    );
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
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { data: pub } = admin.storage.from(TRACKS_BUCKET).getPublicUrl(path);
  const audio_url = pub.publicUrl;

  let cover_art_url: string | null = null;
  const uploadedPaths = [path];

  if (coverFile) {
    const coverMime = coverFile.type || "image/jpeg";
    const coverExt = safeExt(coverFile.name || "cover.jpg", coverMime);
    const coverPath = `${user.id}/covers/${Date.now()}-${crypto.randomUUID()}.${coverExt}`;
    const coverBuffer = Buffer.from(await coverFile.arrayBuffer());
    const { error: coverError } = await admin.storage
      .from(TRACKS_BUCKET)
      .upload(coverPath, coverBuffer, {
        contentType: coverMime,
        upsert: false,
      });
    if (coverError) {
      await admin.storage.from(TRACKS_BUCKET).remove(uploadedPaths);
      return NextResponse.json(
        { error: `Cover upload failed: ${coverError.message}` },
        { status: 500 },
      );
    }
    uploadedPaths.push(coverPath);
    const { data: coverPub } = admin.storage
      .from(TRACKS_BUCKET)
      .getPublicUrl(coverPath);
    cover_art_url = coverPub.publicUrl;
  }

  // Keep artist role on profile
  const displayName =
    (typeof user.user_metadata?.display_name === "string" &&
      user.user_metadata.display_name) ||
    user.email?.split("@")[0] ||
    "Artist";

  await admin.from("users").upsert({
    id: user.id,
    display_name: displayName,
    role: "artist",
    email: user.email ?? null,
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  });

  const insertPayload: Record<string, unknown> = {
    title,
    genre,
    audio_url,
    artist_id: user.id,
  };
  if (cover_art_url) insertPayload.cover_art_url = cover_art_url;

  // Match existing DB values (seed uses "pending")
  let workingPayload = { ...insertPayload };
  const attempts = [
    () => ({ ...workingPayload, status: "pending" }),
    () => ({ ...workingPayload }),
    () => ({ ...workingPayload, status: "published" }),
  ];

  let track: Record<string, unknown> | null = null;
  let lastError: string | null = null;

  for (const build of attempts) {
    const row = build();
    const { data, error } = await admin.from("tracks").insert(row).select("*").maybeSingle();
    if (!error && data) {
      track = data;
      break;
    }
    lastError = error?.message ?? "insert failed";
    if (error && /cover_art_url|column .* does not exist/i.test(error.message)) {
      delete workingPayload.cover_art_url;
      cover_art_url = null;
    }
  }

  if (!track) {
    // Roll back files to avoid orphans
    await admin.storage.from(TRACKS_BUCKET).remove(uploadedPaths);
    return NextResponse.json(
      { error: `Saved file but could not create track row: ${lastError}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    track,
    audio_url,
    cover_art_url,
  });
}
