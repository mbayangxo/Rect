import type { SupabaseClient, User } from "@supabase/supabase-js";

export type DashboardUserProfile = {
  id: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
  account_type: string | null;
  countries: string[] | null;
  genres: string[] | null;
  languages: string[] | null;
};

export type CurrentUserResult =
  | {
      ok: true;
      user: User;
      profile: DashboardUserProfile | null;
      displayName: string;
      query: {
        table: "users";
        select: string;
        eq: { id: string };
      };
      profileError: null;
    }
  | {
      ok: false;
      reason: "no_session" | "auth_error" | "profile_error";
      error: string;
      user: User | null;
      profile: DashboardUserProfile | null;
      displayName: null;
      query: {
        table: "users";
        select: string;
        eq: { id: string };
      } | null;
      profileError: string | null;
    };

const PROFILE_SELECT =
  "id, display_name, email, role, account_type, countries, genres, languages";
const PROFILE_SELECT_LEAN =
  "id, display_name, email, role, account_type, countries, genres";

/**
 * CONNECTION 1 — logged-in user for RECT SOUND dashboard.
 * Auth session + public.users row for display_name.
 */
export async function getDashboardCurrentUser(
  supabase: SupabaseClient,
): Promise<CurrentUserResult> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return {
      ok: false,
      reason: "auth_error",
      error: authError.message,
      user: null,
      profile: null,
      displayName: null,
      query: null,
      profileError: null,
    };
  }

  if (!user) {
    return {
      ok: false,
      reason: "no_session",
      error: "no_session",
      user: null,
      profile: null,
      displayName: null,
      query: null,
      profileError: null,
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .maybeSingle();

  let row = profile as DashboardUserProfile | null;
  let selectUsed = PROFILE_SELECT;
  let finalProfileError = profileError;

  if (
    profileError &&
    /languages|column .* does not exist/i.test(profileError.message)
  ) {
    const lean = await supabase
      .from("users")
      .select(PROFILE_SELECT_LEAN)
      .eq("id", user.id)
      .maybeSingle();
    row = lean.data
      ? ({ ...lean.data, languages: null } as DashboardUserProfile)
      : null;
    selectUsed = PROFILE_SELECT_LEAN;
    finalProfileError = lean.error;
  }

  const query = {
    table: "users" as const,
    select: selectUsed,
    eq: { id: user.id },
  };

  if (finalProfileError) {
    return {
      ok: false,
      reason: "profile_error",
      error: finalProfileError.message,
      user,
      profile: null,
      displayName: null,
      query,
      profileError: finalProfileError.message,
    };
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metaName =
    typeof meta.display_name === "string" ? meta.display_name.trim() : "";
  const metaLanguages = Array.isArray(meta.languages)
    ? (meta.languages.filter((x) => typeof x === "string") as string[])
    : null;
  if (row && !row.languages && metaLanguages) {
    row = { ...row, languages: metaLanguages };
  }
  const displayName =
    (row?.display_name && row.display_name.trim()) ||
    metaName ||
    user.email ||
    "Listener";

  return {
    ok: true,
    user,
    profile: row,
    displayName,
    query,
    profileError: null,
  };
}
