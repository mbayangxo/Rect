import type { SupabaseClient } from "@supabase/supabase-js";

export type RectRole = "fan" | "artist";

export type OnboardingProfile = {
  display_name: string;
  role: RectRole;
  city: string | null;
  phone: string | null;
  email: string | null;
  artist_bio: string | null;
  listen_liked: boolean | null;
  onboarding_completed: boolean;
};

export type ProfileUpsertResult =
  | { ok: true; row: Record<string, unknown>; mode: "full" | "minimal" }
  | { ok: false; error: string };

/**
 * Persist onboarding onto public.users.
 * Tries full column set first; falls back to id/display_name/role if
 * the schema migration has not been applied yet.
 */
export async function upsertUserProfile(
  supabase: SupabaseClient,
  userId: string,
  profile: OnboardingProfile,
): Promise<ProfileUpsertResult> {
  // Live schema may require phone_number (NOT NULL + UNIQUE, varchar(20)).
  // Empty string collides — use a short unique placeholder within 20 chars.
  const phoneTrimmed = profile.phone?.trim() || "";
  const phoneValue =
    phoneTrimmed.slice(0, 20) ||
    `u${userId.replace(/-/g, "").slice(0, 19)}`;
  const phoneColumn = phoneTrimmed || null;

  // Live DB may still enforce role IN ('listener','artist',...). Prefer fan; fall back.
  const rolesToTry: string[] = [profile.role];
  if (profile.role === "fan") rolesToTry.push("listener");

  let lastError = "";
  for (const role of rolesToTry) {
    const full = {
      id: userId,
      display_name: profile.display_name,
      role,
      email: profile.email,
      phone: phoneColumn,
      phone_number: phoneValue,
      city: profile.city,
      artist_bio: profile.artist_bio,
      listen_liked: profile.listen_liked,
      onboarding_completed: profile.onboarding_completed,
      updated_at: new Date().toISOString(),
    };

    const fullAttempt = await supabase.from("users").upsert(full).select().maybeSingle();
    if (!fullAttempt.error) {
      return { ok: true, row: fullAttempt.data ?? full, mode: "full" };
    }

    lastError = fullAttempt.error.message;

    const missingColumn =
      /column .* does not exist/i.test(fullAttempt.error.message) ||
      fullAttempt.error.code === "PGRST204";

    if (missingColumn && /phone_number/i.test(fullAttempt.error.message)) {
      const withoutPhoneNumber = { ...full };
      delete (withoutPhoneNumber as { phone_number?: string }).phone_number;
      const retry = await supabase
        .from("users")
        .upsert(withoutPhoneNumber)
        .select()
        .maybeSingle();
      if (!retry.error) {
        return { ok: true, row: retry.data ?? withoutPhoneNumber, mode: "full" };
      }
      lastError = retry.error.message;
    }

    // Role check — try next alias (fan → listener)
    if (/users_role_check/i.test(fullAttempt.error.message)) {
      continue;
    }

    if (!missingColumn) {
      return { ok: false, error: fullAttempt.error.message };
    }
  }

  const minimal = {
    id: userId,
    display_name: profile.display_name,
    role: profile.role === "fan" ? "listener" : profile.role,
    phone_number: phoneValue,
  };
  const minAttempt = await supabase
    .from("users")
    .upsert(minimal)
    .select()
    .maybeSingle();

  if (minAttempt.error) {
    return { ok: false, error: minAttempt.error.message || lastError };
  }

  return {
    ok: true,
    row: minAttempt.data ?? minimal,
    mode: "minimal",
  };
}

export function profileFromMetadata(
  meta: Record<string, unknown> | undefined,
  email: string | null | undefined,
): OnboardingProfile {
  const role = meta?.role === "artist" ? "artist" : "fan";
  const listenRaw = meta?.listen_liked;
  let listen_liked: boolean | null = null;
  if (typeof listenRaw === "boolean") listen_liked = listenRaw;
  else if (listenRaw === "true") listen_liked = true;
  else if (listenRaw === "false") listen_liked = false;

  return {
    display_name:
      (typeof meta?.display_name === "string" && meta.display_name.trim()) ||
      "User",
    role,
    city: typeof meta?.city === "string" ? meta.city : null,
    phone: typeof meta?.phone === "string" ? meta.phone : null,
    email: email ?? null,
    artist_bio: typeof meta?.artist_bio === "string" ? meta.artist_bio : null,
    listen_liked,
    onboarding_completed: true,
  };
}
