/** Shared place + genre options for onboarding and artist identity. */

export const CULTURAL_PLACES = [
  "Senegal",
  "Nigeria",
  "Ghana",
  "Ivory Coast",
  "Mali",
  "Guinea",
  "Cameroon",
  "Congo",
  "South Africa",
  "Kenya",
  "Morocco",
  "Egypt",
  "USA",
  "France",
  "UK",
  "Canada",
] as const;

export const CULTURAL_GENRES = [
  "Afrobeats",
  "Amapiano",
  "Mbalax",
  "Highlife",
  "Afrohouse",
  "Coupé-Décalé",
  "Soukous",
  "Afro-R&B",
  "Drill",
  "Gospel",
  "Traditional",
  "Hip-Hop",
] as const;

export const CULTURAL_LANGUAGES = [
  "Wolof",
  "Yoruba",
  "Igbo",
  "Hausa",
  "French",
  "English",
  "Swahili",
  "Arabic",
  "Portuguese",
  "Zulu",
  "Akan",
  "Lingala",
] as const;

export type CulturalPlace = (typeof CULTURAL_PLACES)[number];
export type CulturalGenre = (typeof CULTURAL_GENRES)[number];
export type CulturalLanguage = (typeof CULTURAL_LANGUAGES)[number];

export function toggleCulturalItem(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((x) => x !== value)
    : [...list, value];
}

export function cleanCulturalList(value: unknown, max = 24): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t || out.includes(t)) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Match free-text / chip to a catalog genre (case-insensitive). */
export function matchCulturalGenre(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  const hit = CULTURAL_GENRES.find((g) => g.toLowerCase() === lower);
  return hit ?? null;
}

/** Prefer catalog spelling; keep unknown trimmed genres for legacy rows. */
export function normalizeTrackGenre(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().slice(0, 60);
  if (!t) return null;
  return matchCulturalGenre(t) ?? t;
}

export function matchCulturalLanguage(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  const hit = CULTURAL_LANGUAGES.find((l) => l.toLowerCase() === lower);
  return hit ?? null;
}

export function normalizeTrackLanguage(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const t = raw.trim().slice(0, 40);
  if (!t) return null;
  return matchCulturalLanguage(t) ?? t;
}

/** Read duration from an audio File via browser metadata (seconds). */
export function readAudioDurationSecs(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    const done = (secs: number | null) => {
      URL.revokeObjectURL(url);
      resolve(secs);
    };
    audio.onloadedmetadata = () => {
      const d = audio.duration;
      if (!Number.isFinite(d) || d <= 0) {
        done(null);
        return;
      }
      done(Math.round(d));
    };
    audio.onerror = () => done(null);
    audio.src = url;
  });
}
