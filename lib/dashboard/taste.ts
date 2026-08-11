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

export type DaypartId = "morning" | "afternoon" | "evening" | "night";

export const DAYPART_META: Record<
  DaypartId,
  { label: string; energy: string }
> = {
  morning: { label: "Morning", energy: "Soft energy to start the day" },
  afternoon: { label: "Afternoon", energy: "Focus mode · work and create" },
  evening: { label: "Evening", energy: "Unwind as the culture softens" },
  night: { label: "Late Night", energy: "Deep cuts · alone with the sound" },
};

export type ListenerTaste = {
  countries: string[];
  genres: string[];
  languages: string[];
  listening_times: string[];
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
  languages?: string[] | null;
  listening_times?: string[] | null;
} | null): ListenerTaste {
  return {
    countries: normalizeTasteList(profile?.countries),
    genres: normalizeTasteList(profile?.genres),
    languages: normalizeTasteList(profile?.languages),
    listening_times: normalizeTasteList(profile?.listening_times).map((t) =>
      t.toLowerCase(),
    ),
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

/** Same matching rules as genres (case / spacing insensitive). */
export function languageOverlapScore(
  itemLanguages: (string | null | undefined)[],
  preferred: string[],
): number {
  return genreOverlapScore(itemLanguages, preferred);
}

/** Local clock → onboarding daypart id. */
export function currentDaypart(now = new Date()): DaypartId {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

/**
 * If the listener opted into the current daypart, return it.
 * Accepts stored ids (morning) or display titles (Late Night).
 */
export function activeDaypartFromTaste(
  taste: ListenerTaste | null | undefined,
  now = new Date(),
): DaypartId | null {
  if (!taste?.listening_times?.length) return null;
  const current = currentDaypart(now);
  const set = new Set(
    taste.listening_times.map((t) => normalizeGenreKey(t)),
  );
  if (set.has(current)) return current;
  const labelKey = normalizeGenreKey(DAYPART_META[current].label);
  if (set.has(labelKey)) return current;
  if (current === "night" && set.has("late night")) return current;
  return null;
}

const SOFT_MORNING = [
  "afroballad",
  "ballad",
  "gospel",
  "highlife",
  "soukous",
  "acoustic",
  "folk",
  "jazz",
];
const FOCUS_AFTERNOON = [
  "afrobeats",
  "amapiano",
  "afrohouse",
  "afro house",
  "hip-hop",
  "hip hop",
  "rap",
  "dancehall",
  "gqom",
];
const UNWIND_EVENING = [
  "mbalax",
  "highlife",
  "zouk",
  "afrobeats",
  "afropop",
  "rumba",
  "coupe-decale",
  "coupé-décalé",
];
const DEEP_NIGHT = [
  "jazz",
  "experimental",
  "ambient",
  "afroballad",
  "gospel",
  "soul",
  "lofi",
  "lo-fi",
];

function genreHitsKey(genre: string | null | undefined, keys: string[]) {
  if (!genre) return 0;
  const g = normalizeGenreKey(genre);
  let hits = 0;
  for (const k of keys) {
    if (g.includes(k) || k.includes(g)) hits += 1;
  }
  return hits;
}

/**
 * Soft daypart energy score from genre + duration.
 * Higher = better fit for that listening window (not a hard filter).
 */
export function daypartSoftScore(
  daypart: DaypartId,
  track: {
    genre?: string | null;
    duration_secs?: number | null;
  },
): number {
  const dur =
    typeof track.duration_secs === "number" &&
    Number.isFinite(track.duration_secs) &&
    track.duration_secs > 0
      ? track.duration_secs
      : null;

  switch (daypart) {
    case "morning": {
      let score = genreHitsKey(track.genre, SOFT_MORNING) * 3;
      if (dur != null) {
        if (dur >= 150 && dur <= 280) score += 2;
        else if (dur > 360) score -= 1;
      }
      // Soft-penalize hard club energy in the morning
      score -= genreHitsKey(track.genre, ["gqom", "hardstyle", "trap"]) * 2;
      return score;
    }
    case "afternoon": {
      let score = genreHitsKey(track.genre, FOCUS_AFTERNOON) * 3;
      if (dur != null) {
        if (dur >= 180 && dur <= 320) score += 2;
      }
      return score;
    }
    case "evening": {
      let score = genreHitsKey(track.genre, UNWIND_EVENING) * 3;
      if (dur != null) {
        if (dur >= 200 && dur <= 360) score += 2;
      }
      return score;
    }
    case "night": {
      let score = genreHitsKey(track.genre, DEEP_NIGHT) * 3;
      if (dur != null) {
        if (dur >= 240) score += 2;
        if (dur >= 360) score += 1;
      }
      // Slight boost for less-mainstream labels already in DEEP_NIGHT
      return score;
    }
    default:
      return 0;
  }
}

export function hasTasteSignal(taste: ListenerTaste) {
  return (
    taste.countries.length > 0 ||
    taste.genres.length > 0 ||
    taste.languages.length > 0 ||
    taste.listening_times.length > 0
  );
}

/** Load listener taste from users (+ auth metadata fallback). */
export async function loadListenerTaste(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  meta?: Record<string, unknown> | null,
): Promise<ListenerTaste> {
  const full = await supabase
    .from("users")
    .select("countries, genres, languages, listening_times")
    .eq("id", userId)
    .maybeSingle();

  let profile = full.data as {
    countries?: string[] | null;
    genres?: string[] | null;
    languages?: string[] | null;
    listening_times?: string[] | null;
  } | null;

  if (
    full.error &&
    /languages|listening_times|column .* does not exist/i.test(
      full.error.message,
    )
  ) {
    const mid = await supabase
      .from("users")
      .select("countries, genres, languages")
      .eq("id", userId)
      .maybeSingle();
    if (
      mid.error &&
      /languages|column .* does not exist/i.test(mid.error.message)
    ) {
      const lean = await supabase
        .from("users")
        .select("countries, genres")
        .eq("id", userId)
        .maybeSingle();
      profile = lean.data
        ? { ...lean.data, languages: null, listening_times: null }
        : null;
    } else {
      profile = mid.data
        ? { ...mid.data, listening_times: null }
        : null;
    }
  }

  let taste = tasteFromProfile(profile);

  if (meta) {
    if (taste.languages.length === 0 && Array.isArray(meta.languages)) {
      taste = {
        ...taste,
        languages: normalizeTasteList(meta.languages),
      };
    }
    if (
      taste.listening_times.length === 0 &&
      Array.isArray(meta.listening_times)
    ) {
      taste = {
        ...taste,
        listening_times: normalizeTasteList(meta.listening_times).map((t) =>
          t.toLowerCase(),
        ),
      };
    }
  }

  return taste;
}
