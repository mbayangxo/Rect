import type { SupabaseClient, User } from "@supabase/supabase-js";

export type DashboardUserProfile = {
  id: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
  account_type: string | null;
  countries: string[] | null;
  genres: string[] | null;
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

  const query = {
    table: "users" as const,
    select: PROFILE_SELECT,
    eq: { id: user.id },
  };

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false,
      reason: "profile_error",
      error: profileError.message,
      user,
      profile: null,
      displayName: null,
      query,
      profileError: profileError.message,
    };
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metaName =
    typeof meta.display_name === "string" ? meta.display_name.trim() : "";
  const row = profile as DashboardUserProfile | null;
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
