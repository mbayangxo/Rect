import type { User } from "@supabase/supabase-js";
import type { DashboardUserProfile } from "@/lib/dashboard/current-user";

/** Artist Studio access — account_type/role artist (DB or auth metadata). */
export function isArtistAccount(
  profile: Pick<DashboardUserProfile, "account_type" | "role"> | null | undefined,
  user?: User | null,
): boolean {
  if (
    profile?.account_type === "artist" ||
    profile?.role === "artist"
  ) {
    return true;
  }
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  return meta.account_type === "artist" || meta.role === "artist";
}
