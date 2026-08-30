import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRACKS_BUCKET } from "@/lib/tracks";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

function safeExt(name: string, mime: string) {
  const fromName = name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

export async function uploadMerchPhoto(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  file: File,
): Promise<
  | { ok: true; image_url: string }
  | { ok: false; error: string; status: number }
> {
  if (file.size === 0) {
    return { ok: false, error: "Photo is required.", status: 400 };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Photo must be under 8MB.", status: 400 };
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

  const ext = safeExt(file.name || "photo.jpg", mime);
  const path = `${userId}/merch/${itemId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
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
  return { ok: true, image_url: pub.publicUrl };
}

export function storagePathFromPublicUrl(url: string | null | undefined): string | null {
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
