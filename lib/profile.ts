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

/** Always unique within varchar(20) — live DB has UNIQUE NOT NULL phone_number. */
function uniquePhoneKey(userId: string) {
  return `u${userId.replace(/-/g, "").slice(0, 19)}`;
}

/**
 * Persist cultural onboarding onto public.users.
 * Falls back when newer columns / role constraints differ.
 */
export async function upsertUserProfile(
  supabase: SupabaseClient,
  userId: string,
  profile: OnboardingProfile,
): Promise<ProfileUpsertResult> {
  const phoneTrimmed = profile.phone?.trim() || "";
  const phoneColumn = phoneTrimmed || null;
  // Never put optional user phone into UNIQUE phone_number — collisions wipe the row.
  const phoneNumberKey = uniquePhoneKey(userId);

  const rolesToTry: string[] = [profile.role];
  if (profile.role === "fan") rolesToTry.push("listener");

  let lastError = "";

  async function attempt(
    payload: Record<string, unknown>,
  ): Promise<ProfileUpsertResult | null> {
    const res = await supabase.from("users").upsert(payload).select().maybeSingle();
    if (!res.error) {
      return { ok: true, row: res.data ?? payload, mode: "full" };
    }
    lastError = res.error.message;
    return null;
  }

  for (const role of rolesToTry) {
    const full: Record<string, unknown> = {
      id: userId,
      display_name: profile.display_name,
      role,
      account_type: profile.account_type,
      email: profile.email,
      phone: phoneColumn,
      phone_number: phoneNumberKey,
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

    const okFull = await attempt(full);
    if (okFull) return okFull;

    if (/users_role_check/i.test(lastError)) continue;

    // Duplicate phone_number — force unique key and retry
    if (/users_phone_number_key|duplicate key/i.test(lastError)) {
      const forced = { ...full, phone_number: uniquePhoneKey(userId) };
      const okForced = await attempt(forced);
      if (okForced) return okForced;
    }

    const missingColumn =
      /column .* does not exist/i.test(lastError) ||
      /PGRST204/i.test(lastError);

    // Strip cultural columns if migration not applied
    const stripped = { ...full };
    delete stripped.countries;
    delete stripped.genres;
    delete stripped.languages;
    delete stripped.listening_times;
    delete stripped.account_type;
    const okStripped = await attempt(stripped);
    if (okStripped) return okStripped;

    if (/users_role_check/i.test(lastError)) continue;

    // Drop optional columns that may not exist on live schema
    const lean = { ...stripped };
    delete lean.phone;
    delete lean.email;
    delete lean.city;
    delete lean.artist_bio;
    delete lean.listen_liked;
    const okLean = await attempt(lean);
    if (okLean) return okLean;

    if (missingColumn || /column .* does not exist/i.test(lastError)) {
      const noPhoneCol = { ...lean };
      delete noPhoneCol.phone_number;
      const okNoPhone = await attempt(noPhoneCol);
      if (okNoPhone) return okNoPhone;
    }
  }

  // Last resort — smallest row that still satisfies legacy NOT NULL phone_number
  const minimalPayloads: Record<string, unknown>[] = [
    {
      id: userId,
      display_name: profile.display_name,
      role: profile.role === "fan" ? "listener" : profile.role,
      phone_number: phoneNumberKey,
    },
    {
      id: userId,
      display_name: profile.display_name,
      role: profile.role === "fan" ? "listener" : profile.role,
    },
  ];

  for (const payload of minimalPayloads) {
    const res = await supabase.from("users").upsert(payload).select().maybeSingle();
    if (!res.error) {
      return { ok: true, row: res.data ?? payload, mode: "minimal" };
    }
    lastError = res.error.message;
  }

  return { ok: false, error: lastError || "Profile upsert failed." };
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
