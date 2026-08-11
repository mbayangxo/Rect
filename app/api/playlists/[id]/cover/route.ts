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

/** Owner uploads / replaces playlist cover art. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const playlistId = id?.trim();
  if (!playlistId) {
    return NextResponse.json({ error: "Playlist id required." }, { status: 400 });
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
    .from("playlists")
    .select("id, user_id, cover_art_url")
    .eq("id", playlistId)
    .maybeSingle();

  if (findError) {
    if (/cover_art_url|column .* does not exist/i.test(findError.message)) {
      return NextResponse.json(
        {
          error: "Run 20260808_playlist_cover.sql in Supabase first",
          code: "missing_column",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
  }
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: "Not your playlist." }, { status: 403 });
  }

  const coverExt = safeExt(cover.name || "cover.jpg", coverMime);
  const coverPath = `${user.id}/playlist-covers/${Date.now()}-${crypto.randomUUID()}.${coverExt}`;
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
    .from("playlists")
    .update({
      cover_art_url,
      updated_at: new Date().toISOString(),
    })
    .eq("id", playlistId)
    .eq("user_id", user.id)
    .select("id, cover_art_url, name")
    .maybeSingle();

  if (error) {
    await admin.storage.from(TRACKS_BUCKET).remove([coverPath]);
    if (/cover_art_url|column .* does not exist/i.test(error.message)) {
      return NextResponse.json(
        {
          error: "Run 20260808_playlist_cover.sql in Supabase first",
          code: "missing_column",
        },
        { status: 503 },
      );
    }
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
    playlist: data,
    cover_art_url,
  });
}

/** Owner removes playlist cover art. */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const playlistId = id?.trim();
  if (!playlistId) {
    return NextResponse.json({ error: "Playlist id required." }, { status: 400 });
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
    .from("playlists")
    .select("id, user_id, cover_art_url")
    .eq("id", playlistId)
    .maybeSingle();

  if (findError) {
    if (/cover_art_url|column .* does not exist/i.test(findError.message)) {
      return NextResponse.json(
        {
          error: "Run 20260808_playlist_cover.sql in Supabase first",
          code: "missing_column",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
  }
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: "Not your playlist." }, { status: 403 });
  }

  if (!existing.cover_art_url) {
    return NextResponse.json({ ok: true, cover_art_url: null });
  }

  const { data, error } = await supabase
    .from("playlists")
    .update({
      cover_art_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", playlistId)
    .eq("user_id", user.id)
    .select("id, cover_art_url, name")
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
    playlist: data,
    cover_art_url: null,
  });
}
