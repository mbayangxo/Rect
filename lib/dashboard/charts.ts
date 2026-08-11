import { placesMatch } from "@/lib/dashboard/places";

/** Dakar board: city pulse — Senegal artists (+ explicit Dakar if set). */
export const DAKAR_CHART_PLACES = ["Senegal", "Dakar"] as const;

/**
 * Alkebulan board: continental Africa from onboarding places
 * (excludes diaspora USA / France / UK / Canada).
 */
export const ALKEBULAN_CHART_PLACES = [
  "Senegal",
  "Nigeria",
  "Ghana",
  "Ivory Coast",
  "Côte d'Ivoire",
  "Cote d'Ivoire",
  "Mali",
  "Guinea",
  "Cameroon",
  "Congo",
  "South Africa",
  "Kenya",
  "Morocco",
  "Egypt",
] as const;

export function artistMatchesPlaces(
  artistCountries: string[],
  placeKeys: readonly string[],
): boolean {
  if (placeKeys.length === 0) return true;
  if (artistCountries.length === 0) return false;
  return artistCountries.some((c) =>
    placeKeys.some((p) => placesMatch(c, p)),
  );
}

export function placeOverlapScore(
  artistCountries: string[],
  preferred: string[],
): number {
  if (preferred.length === 0 || artistCountries.length === 0) return 0;
  let score = 0;
  for (const c of artistCountries) {
    for (const p of preferred) {
      if (placesMatch(c, p)) score += 1;
    }
  }
  return score;
}
