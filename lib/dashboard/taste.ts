/** Map onboarding place names → play_packs.country codes. */
const COUNTRY_TO_PACK: Record<string, string> = {
  senegal: "SN",
  nigeria: "NG",
  ghana: "GH",
  "ivory coast": "CI",
  "côte d'ivoire": "CI",
  "cote d'ivoire": "CI",
  mali: "ML",
  guinea: "GN",
  cameroon: "CM",
  congo: "CG",
  "south africa": "ZA",
  kenya: "KE",
  morocco: "MA",
  egypt: "EG",
  usa: "US",
  "united states": "US",
  france: "FR",
  uk: "GB",
  "united kingdom": "GB",
  canada: "CA",
};

export type ListenerTaste = {
  countries: string[];
  genres: string[];
};

export function normalizeTasteList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function tasteFromProfile(profile: {
  countries?: string[] | null;
  genres?: string[] | null;
} | null): ListenerTaste {
  return {
    countries: normalizeTasteList(profile?.countries),
    genres: normalizeTasteList(profile?.genres),
  };
}

/** Prefer first mapped country; default SN (seeded packs). */
export function packCountryFromTaste(taste: ListenerTaste): string {
  for (const c of taste.countries) {
    const code = COUNTRY_TO_PACK[c.trim().toLowerCase()];
    if (code) return code;
  }
  return "SN";
}

export function normalizeGenreKey(g: string) {
  return g.trim().toLowerCase().replace(/\s+/g, " ");
}

export function genreOverlapScore(
  itemGenres: (string | null | undefined)[],
  preferred: string[],
): number {
  if (preferred.length === 0) return 0;
  const pref = new Set(preferred.map(normalizeGenreKey));
  let score = 0;
  for (const g of itemGenres) {
    if (!g) continue;
    if (pref.has(normalizeGenreKey(g))) score += 1;
  }
  return score;
}

export function hasTasteSignal(taste: ListenerTaste) {
  return taste.countries.length > 0 || taste.genres.length > 0;
}
