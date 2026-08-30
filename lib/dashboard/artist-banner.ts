import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRACKS_BUCKET } from "@/lib/tracks";

const MAX_BANNER_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

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

export async function uploadArtistBanner(
  supabase: SupabaseClient,
  userId: string,
  file: File,
): Promise<
  | { ok: true; banner_url: string }
  | { ok: false; error: string; status: number }
> {
  if (file.size === 0) {
    return { ok: false, error: "Banner image is required.", status: 400 };
  }
  if (file.size > MAX_BANNER_BYTES) {
    return { ok: false, error: "Banner must be under 8MB.", status: 400 };
  }
  const mime = file.type || "image/jpeg";
  if (!ALLOWED.has(mime) && !mime.startsWith("image/")) {
    return { ok: false, error: `Unsupported image type: ${mime}`, status: 400 };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      error: "Server missing SUPABASE_SERVICE_ROLE_KEY.",
      status: 503,
    };
  }

  const { data: existing } = await supabase
    .from("users")
    .select("artist_banner_url")
    .eq("id", userId)
    .maybeSingle();

  const oldPath = storagePathFromPublicUrl(
    existing?.artist_banner_url as string | null,
  );

  const ext = safeExt(file.name || "banner.jpg", mime);
  const path = `${userId}/banners/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from(TRACKS_BUCKET)
    .upload(path, buffer, { contentType: mime, upsert: false });

  if (uploadError) {
    return {
      ok: false,
      error: `Upload failed: ${uploadError.message}`,
      status: 500,
    };
  }

  const { data: pub } = admin.storage.from(TRACKS_BUCKET).getPublicUrl(path);
  const banner_url = pub.publicUrl;

  const { error: updateError } = await supabase
    .from("users")
    .update({
      artist_banner_url: banner_url,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (updateError) {
    await admin.storage.from(TRACKS_BUCKET).remove([path]);
    if (/artist_banner_url|column .* does not exist/i.test(updateError.message)) {
      return {
        ok: false,
        error: "Run 20260830_users_artist_banner.sql in Supabase.",
        status: 503,
      };
    }
    return { ok: false, error: updateError.message, status: 500 };
  }

  if (oldPath && oldPath !== path) {
    await admin.storage.from(TRACKS_BUCKET).remove([oldPath]);
  }

  return { ok: true, banner_url };
}

export async function deleteArtistBanner(
  supabase: SupabaseClient,
  userId: string,
): Promise<
  | { ok: true; banner_url: null }
  | { ok: false; error: string; status: number }
> {
  const { data: existing } = await supabase
    .from("users")
    .select("artist_banner_url")
    .eq("id", userId)
    .maybeSingle();

  const oldPath = storagePathFromPublicUrl(
    existing?.artist_banner_url as string | null,
  );

  const { error } = await supabase
    .from("users")
    .update({
      artist_banner_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    if (/artist_banner_url|column .* does not exist/i.test(error.message)) {
      return {
        ok: false,
        error: "Run 20260830_users_artist_banner.sql in Supabase.",
        status: 503,
      };
    }
    return { ok: false, error: error.message, status: 500 };
  }

  const admin = createAdminClient();
  if (admin && oldPath) {
    await admin.storage.from(TRACKS_BUCKET).remove([oldPath]);
  }

  return { ok: true, banner_url: null };
}
