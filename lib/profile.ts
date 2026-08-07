import type { SupabaseClient } from "@supabase/supabase-js";

export type RectRole = "fan" | "artist";

export type OnboardingProfile = {
  display_name: string;
  role: RectRole;
  account_type: RectRole;
  phone: string | null;
  email: string | null;
  countries: string[];
  genres: string[];
  languages: string[];
  listening_times: string[];
  onboarding_completed: boolean;
  /** legacy optional fields */
  city?: string | null;
  artist_bio?: string | null;
  listen_liked?: boolean | null;
};

export type ProfileUpsertResult =
  | { ok: true; row: Record<string, unknown>; mode: "full" | "minimal" }
  | { ok: false; error: string };

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Persist cultural onboarding onto public.users.
 * Falls back when newer columns are missing or role constraints differ.
 */
export async function upsertUserProfile(
  supabase: SupabaseClient,
  userId: string,
  profile: OnboardingProfile,
): Promise<ProfileUpsertResult> {
  const phoneTrimmed = profile.phone?.trim() || "";
  const phoneValue =
    phoneTrimmed.slice(0, 20) ||
    `u${userId.replace(/-/g, "").slice(0, 19)}`;
  const phoneColumn = phoneTrimmed || null;

  const rolesToTry: string[] = [profile.role];
  if (profile.role === "fan") rolesToTry.push("listener");

  let lastError = "";

  for (const role of rolesToTry) {
    const full: Record<string, unknown> = {
      id: userId,
      display_name: profile.display_name,
      role,
      account_type: profile.account_type,
      email: profile.email,
      phone: phoneColumn,
      phone_number: phoneValue,
      countries: profile.countries,
      genres: profile.genres,
      languages: profile.languages,
      listening_times: profile.listening_times,
      onboarding_completed: profile.onboarding_completed,
      updated_at: new Date().toISOString(),
    };

    if (profile.city !== undefined) full.city = profile.city;
    if (profile.artist_bio !== undefined) full.artist_bio = profile.artist_bio;
    if (profile.listen_liked !== undefined) {
      full.listen_liked = profile.listen_liked;
    }

    const fullAttempt = await supabase
      .from("users")
      .upsert(full)
      .select()
      .maybeSingle();

    if (!fullAttempt.error) {
      return { ok: true, row: fullAttempt.data ?? full, mode: "full" };
    }

    lastError = fullAttempt.error.message;

    if (/users_role_check/i.test(fullAttempt.error.message)) {
      continue;
    }

    const missingColumn =
      /column .* does not exist/i.test(fullAttempt.error.message) ||
      fullAttempt.error.code === "PGRST204";

    if (!missingColumn) {
      // Try without cultural array / account_type columns
      const stripped = { ...full };
      delete stripped.countries;
      delete stripped.genres;
      delete stripped.languages;
      delete stripped.listening_times;
      delete stripped.account_type;
      const retry = await supabase
        .from("users")
        .upsert(stripped)
        .select()
        .maybeSingle();
      if (!retry.error) {
        return { ok: true, row: retry.data ?? stripped, mode: "full" };
      }
      lastError = retry.error.message;
      if (/users_role_check/i.test(retry.error.message)) continue;
      return { ok: false, error: lastError };
    }

    // Missing column path: drop phone_number / cultural cols progressively
    const candidates: Record<string, unknown>[] = [];
    {
      const a = { ...full };
      delete a.phone_number;
      candidates.push(a);
    }
    {
      const a = { ...full };
      delete a.countries;
      delete a.genres;
      delete a.languages;
      delete a.listening_times;
      delete a.account_type;
      delete a.phone_number;
      candidates.push(a);
    }

    for (const payload of candidates) {
      const retry = await supabase
        .from("users")
        .upsert(payload)
        .select()
        .maybeSingle();
      if (!retry.error) {
        return { ok: true, row: retry.data ?? payload, mode: "full" };
      }
      lastError = retry.error.message;
      if (/users_role_check/i.test(retry.error.message)) break;
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
  const accountRaw = meta?.account_type;
  const account_type: RectRole =
    accountRaw === "artist" || accountRaw === "fan" ? accountRaw : role;

  return {
    display_name:
      (typeof meta?.display_name === "string" && meta.display_name.trim()) ||
      "User",
    role,
    account_type,
    phone: typeof meta?.phone === "string" ? meta.phone : null,
    email: email ?? null,
    countries: asStringArray(meta?.countries),
    genres: asStringArray(meta?.genres),
    languages: asStringArray(meta?.languages),
    listening_times: asStringArray(meta?.listening_times),
    onboarding_completed: true,
    city: typeof meta?.city === "string" ? meta.city : null,
    artist_bio: typeof meta?.artist_bio === "string" ? meta.artist_bio : null,
    listen_liked:
      typeof meta?.listen_liked === "boolean" ? meta.listen_liked : null,
  };
}
