import type { SupabaseClient } from "@supabase/supabase-js";
import {
  artistCreditName,
  isProfilePublic,
  type ProfilePrivacyRow,
} from "@/lib/dashboard/privacy";

type NameRow = {
  id: string;
  display_name: string | null;
  privacy_public_profile?: boolean | null;
};

/** Load public-safe artist credit names for a set of user ids. */
export async function loadArtistCreditMap(
  db: SupabaseClient,
  artistIds: string[],
): Promise<Map<string, string>> {
  const nameById = new Map<string, string>();
  if (artistIds.length === 0) return nameById;

  const full = await db
    .from("users")
    .select("id, display_name, privacy_public_profile")
    .in("id", artistIds);

  let rows: NameRow[] = [];

  if (
    full.error &&
    /privacy_public_profile|column .* does not exist/i.test(full.error.message)
  ) {
    const lean = await db
      .from("users")
      .select("id, display_name")
      .in("id", artistIds);
    if (lean.error) return nameById;
    rows = (lean.data ?? []) as NameRow[];
  } else if (full.error) {
    return nameById;
  } else {
    rows = (full.data ?? []) as NameRow[];
  }

  for (const a of rows) {
    nameById.set(
      a.id,
      artistCreditName({
        display_name: a.display_name,
        privacy_public_profile: a.privacy_public_profile ?? true,
      }),
    );
  }
  return nameById;
}

export function rowIsPublicArtist(row: ProfilePrivacyRow) {
  return isProfilePublic(row);
}
