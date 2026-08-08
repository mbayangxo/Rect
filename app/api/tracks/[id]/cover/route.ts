import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { TRACKS_BUCKET } from "@/lib/tracks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_COVER_BYTES = 5 * 1024 * 1024;
const ALLOWED_COVER = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
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
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

/** Artist replaces cover art for own track. */
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
          "Server missing SUPABASE_SERVICE_ROLE_KEY — cannot upload cover.",
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

  const cover = form.get("cover");
  if (!(cover instanceof File) || cover.size === 0) {
    return NextResponse.json(
      { error: "Cover image is required." },
      { status: 400 },
    );
  }
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

  const { data: existing, error: findError } = await supabase
    .from("tracks")
    .select("id, artist_id, cover_art_url")
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

  const coverExt = safeExt(cover.name || "cover.jpg", coverMime);
  const coverPath = `${user.id}/covers/${Date.now()}-${crypto.randomUUID()}.${coverExt}`;
  const coverBuffer = Buffer.from(await cover.arrayBuffer());

  const { error: coverError } = await admin.storage
    .from(TRACKS_BUCKET)
    .upload(coverPath, coverBuffer, {
      contentType: coverMime,
      upsert: false,
    });

  if (coverError) {
    return NextResponse.json(
      { error: `Cover upload failed: ${coverError.message}` },
      { status: 500 },
    );
  }

  const { data: coverPub } = admin.storage
    .from(TRACKS_BUCKET)
    .getPublicUrl(coverPath);
  const cover_art_url = coverPub.publicUrl;

  const { data, error } = await supabase
    .from("tracks")
    .update({ cover_art_url })
    .eq("id", trackId)
    .eq("artist_id", user.id)
    .select("id, cover_art_url, title")
    .maybeSingle();

  if (error) {
    await admin.storage.from(TRACKS_BUCKET).remove([coverPath]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const oldPath = storagePathFromPublicUrl(
    existing.cover_art_url as string | null,
  );
  if (oldPath && oldPath !== coverPath) {
    await admin.storage.from(TRACKS_BUCKET).remove([oldPath]);
  }

  return NextResponse.json({
    ok: true,
    track: data,
    cover_art_url,
  });
}

/** Artist removes cover art from own track. */
export async function DELETE(_request: Request, { params }: Params) {
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

  const { data: existing, error: findError } = await supabase
    .from("tracks")
    .select("id, artist_id, cover_art_url")
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

  if (!existing.cover_art_url) {
    return NextResponse.json({ ok: true, cover_art_url: null });
  }

  const { data, error } = await supabase
    .from("tracks")
    .update({ cover_art_url: null })
    .eq("id", trackId)
    .eq("artist_id", user.id)
    .select("id, cover_art_url, title")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const admin = createAdminClient();
  const oldPath = storagePathFromPublicUrl(
    existing.cover_art_url as string | null,
  );
  if (admin && oldPath) {
    await admin.storage.from(TRACKS_BUCKET).remove([oldPath]);
  }

  return NextResponse.json({
    ok: true,
    track: data,
    cover_art_url: null,
  });
}
