import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRACKS_BUCKET } from "@/lib/tracks";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
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

export type AvatarUploadResult =
  | { ok: true; avatar_url: string }
  | {
      ok: false;
      error: string;
      code?: "missing_column" | "invalid" | "failed" | "no_admin";
      status: number;
    };

export type AvatarDeleteResult =
  | { ok: true; avatar_url: null }
  | {
      ok: false;
      error: string;
      code?: "missing_column" | "failed";
      status: number;
    };

/** Any signed-in user can set a public avatar (artists + listeners). */
export async function uploadUserAvatar(
  supabase: SupabaseClient,
  userId: string,
  file: File,
): Promise<AvatarUploadResult> {
  if (file.size === 0) {
    return {
      ok: false,
      error: "Avatar image is required.",
      code: "invalid",
      status: 400,
    };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return {
      ok: false,
      error: "Avatar must be under 5MB.",
      code: "invalid",
      status: 400,
    };
  }
  const mime = file.type || "image/jpeg";
  if (!ALLOWED.has(mime) && !mime.startsWith("image/")) {
    return {
      ok: false,
      error: `Unsupported image type: ${mime}`,
      code: "invalid",
      status: 400,
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      error: "Server missing SUPABASE_SERVICE_ROLE_KEY — cannot upload avatar.",
      code: "no_admin",
      status: 503,
    };
  }

  const { data: existing } = await supabase
    .from("users")
    .select("avatar_url")
    .eq("id", userId)
    .maybeSingle();

  const ext = safeExt(file.name || "avatar.jpg", mime);
  const path = `${userId}/avatars/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from(TRACKS_BUCKET)
    .upload(path, buffer, {
      contentType: mime,
      upsert: false,
    });

  if (uploadError) {
    return {
      ok: false,
      error: `Upload failed: ${uploadError.message}`,
      code: "failed",
      status: 500,
    };
  }

  const { data: pub } = admin.storage.from(TRACKS_BUCKET).getPublicUrl(path);
  const avatar_url = pub.publicUrl;

  const { error } = await supabase
    .from("users")
    .update({
      avatar_url,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    await admin.storage.from(TRACKS_BUCKET).remove([path]);
    if (/avatar_url|column .* does not exist/i.test(error.message)) {
      return {
        ok: false,
        error: "Run 20260808_users_avatar.sql in Supabase first",
        code: "missing_column",
        status: 503,
      };
    }
    return {
      ok: false,
      error: error.message,
      code: "failed",
      status: 500,
    };
  }

  await supabase.auth.updateUser({ data: { avatar_url } });

  const oldPath = storagePathFromPublicUrl(
    (existing?.avatar_url as string | null) ?? null,
  );
  if (oldPath && oldPath !== path) {
    await admin.storage.from(TRACKS_BUCKET).remove([oldPath]);
  }

  return { ok: true, avatar_url };
}

export async function deleteUserAvatar(
  supabase: SupabaseClient,
  userId: string,
): Promise<AvatarDeleteResult> {
  const { data: existing, error: findError } = await supabase
    .from("users")
    .select("avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (findError) {
    if (/avatar_url|column .* does not exist/i.test(findError.message)) {
      return {
        ok: false,
        error: "Run 20260808_users_avatar.sql in Supabase first",
        code: "missing_column",
        status: 503,
      };
    }
    return {
      ok: false,
      error: findError.message,
      code: "failed",
      status: 500,
    };
  }

  if (!existing?.avatar_url) {
    return { ok: true, avatar_url: null };
  }

  const { error } = await supabase
    .from("users")
    .update({
      avatar_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    return {
      ok: false,
      error: error.message,
      code: "failed",
      status: 500,
    };
  }

  await supabase.auth.updateUser({ data: { avatar_url: null } });

  const admin = createAdminClient();
  const oldPath = storagePathFromPublicUrl(
    existing.avatar_url as string | null,
  );
  if (admin && oldPath) {
    await admin.storage.from(TRACKS_BUCKET).remove([oldPath]);
  }

  return { ok: true, avatar_url: null };
}
