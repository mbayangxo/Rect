/** Public profile privacy helpers (privacy_public_profile on users). */

export type ProfilePrivacyRow = {
  id?: string;
  display_name?: string | null;
  privacy_public_profile?: boolean | null;
};

export function isProfilePublic(row: ProfilePrivacyRow | null | undefined) {
  if (!row) return true;
  return row.privacy_public_profile !== false;
}

/**
 * Name safe to show on public discovery surfaces.
 * Returns null when the user opted out of a public profile.
 */
export function publicDisplayName(
  row: ProfilePrivacyRow | null | undefined,
): string | null {
  if (!isProfilePublic(row)) return null;
  const name = row?.display_name?.trim();
  return name || null;
}

/** Credit line for tracks when artist is private. */
export const PRIVATE_ARTIST_LABEL = "Private artist";

export function artistCreditName(
  row: ProfilePrivacyRow | null | undefined,
): string {
  return publicDisplayName(row) ?? PRIVATE_ARTIST_LABEL;
}
