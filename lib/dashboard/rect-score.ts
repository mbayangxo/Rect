import type { SupabaseClient } from "@supabase/supabase-js";
import { artistMatchesPlaces, placeOverlapScore } from "@/lib/dashboard/charts";
import { trackMatchesGenre } from "@/lib/dashboard/genres";
import { loadLikeCountMap } from "@/lib/dashboard/likes";
import { trackMatchesLanguage } from "@/lib/dashboard/languages";
import { normalizeTasteList } from "@/lib/dashboard/taste";
import type { TrackRow } from "@/lib/tracks";

/** RECT SCORE weights — streams · engagement · purchases · editorial · cultural. */
export const RECT_SCORE_WEIGHTS = {
  streams: 0.25,
  engagement: 0.25,
  purchases: 0.2,
  editorial: 0.15,
  cultural: 0.15,
} as const;

/** Raw purchase points before cohort normalization (higher = stronger fan signal). */
export const PURCHASE_SCORE_POINTS = {
  song: 10,
  album: 40,
  cd: 60,
  vinyl: 80,
} as const;

export type MusicPurchaseFormat = keyof typeof PURCHASE_SCORE_POINTS;

export type StandingsCadence = "daily" | "weekly";

export type RectScoreBreakdown = {
  streams: number;
  engagement: number;
  purchases: number;
  editorial: number;
  cultural: number;
  total: number;
};

export type TrackScoreInputs = {
  trackId: string;
  streamsInWindow: number;
  likes: number;
  comments: number;
  purchasesInWindow: number;
  editorialBoost: number;
  publishedAt: string | null;
  culturalRaw: number;
};

function windowStartIso(cadence: StandingsCadence): string {
  const now = new Date();
  if (cadence === "daily") {
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString();
  }
  const week = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  week.setUTCDate(week.getUTCDate() - 6);
  return week.toISOString();
}

function editorialFromRecency(publishedAt: string | null): number {
  if (!publishedAt) return 0;
  const ms = Date.now() - new Date(publishedAt).getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  if (days < 0 || days > 14) return 0;
  return Math.max(0, Math.round(100 - days * 7));
}

function normalizeMap(values: Map<string, number>): Map<string, number> {
  let max = 0;
  for (const v of values.values()) max = Math.max(max, v);
  if (max <= 0) {
    return new Map([...values.keys()].map((k) => [k, 0]));
  }
  return new Map(
    [...values.entries()].map(([k, v]) => [k, (v / max) * 100]),
  );
}

export function computeRectScoreFromNormalized(parts: {
  streams: number;
  engagement: number;
  purchases: number;
  editorial: number;
  cultural: number;
}): number {
  const w = RECT_SCORE_WEIGHTS;
  return (
    parts.streams * w.streams +
    parts.engagement * w.engagement +
    parts.purchases * w.purchases +
    parts.editorial * w.editorial +
    parts.cultural * w.cultural
  );
}

export function culturalResonanceRaw(
  track: TrackRow,
  artistCountries: string[],
  artistCity: string | null,
  board: {
    kind: "neighborhood" | "city" | "genre" | "alkebulan" | "global";
    placeKeys?: readonly string[];
    genre?: string | null;
    neighborhoodCity?: string | null;
  },
): number {
  switch (board.kind) {
    case "neighborhood": {
      const city = board.neighborhoodCity?.trim().toLowerCase();
      const artist = artistCity?.trim().toLowerCase();
      if (!city || !artist) return 0;
      return city === artist || artist.includes(city) || city.includes(artist)
        ? 100
        : 0;
    }
    case "city": {
      if (!board.placeKeys?.length) return 0;
      const overlap = placeOverlapScore(artistCountries, [...board.placeKeys]);
      return overlap > 0 ? Math.min(100, 40 + overlap * 30) : 0;
    }
    case "genre": {
      if (!board.genre) return 0;
      return trackMatchesGenre(track.genre, board.genre) ? 100 : 0;
    }
    case "alkebulan": {
      if (!board.placeKeys?.length) return 0;
      let score = placeOverlapScore(artistCountries, [...board.placeKeys]) * 25;
      if (track.genre?.trim()) score += 15;
      if (track.language?.trim()) score += 10;
      return Math.min(100, score);
    }
    case "global": {
      let score = 20;
      if (track.genre?.trim()) score += 20;
      if (track.language?.trim()) score += 20;
      if (artistCountries.length > 0) score += 20;
      return Math.min(100, score);
    }
    default:
      return 0;
  }
}

/**
 * Score every track in a cohort with RECT SCORE for a standings window.
 */
export function scoreTrackCohort(
  inputs: TrackScoreInputs[],
): Map<string, RectScoreBreakdown> {
  const streamsRaw = new Map<string, number>();
  const engagementRaw = new Map<string, number>();
  const purchasesRaw = new Map<string, number>();
  const editorialRaw = new Map<string, number>();
  const culturalRaw = new Map<string, number>();

  for (const row of inputs) {
    streamsRaw.set(row.trackId, row.streamsInWindow);
    engagementRaw.set(
      row.trackId,
      row.likes + row.comments * 3,
    );
    purchasesRaw.set(row.trackId, row.purchasesInWindow);
    editorialRaw.set(
      row.trackId,
      Math.min(
        100,
        row.editorialBoost + editorialFromRecency(row.publishedAt),
      ),
    );
    culturalRaw.set(row.trackId, row.culturalRaw);
  }

  const streamsN = normalizeMap(streamsRaw);
  const engagementN = normalizeMap(engagementRaw);
  const purchasesN = normalizeMap(purchasesRaw);
  const editorialN = normalizeMap(editorialRaw);
  const culturalN = normalizeMap(culturalRaw);

  const out = new Map<string, RectScoreBreakdown>();
  for (const row of inputs) {
    const parts = {
      streams: streamsN.get(row.trackId) ?? 0,
      engagement: engagementN.get(row.trackId) ?? 0,
      purchases: purchasesN.get(row.trackId) ?? 0,
      editorial: editorialN.get(row.trackId) ?? 0,
      cultural: culturalN.get(row.trackId) ?? 0,
    };
    out.set(row.trackId, {
      ...parts,
      total: computeRectScoreFromNormalized(parts),
    });
  }
  return out;
}

async function loadArtistCityMap(
  db: SupabaseClient,
  artistIds: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (artistIds.length === 0) return map;

  const { data, error } = await db
    .from("users")
    .select("id, city")
    .in("id", artistIds);

  if (error || !data) return map;
  for (const row of data) {
    const city =
      typeof row.city === "string" && row.city.trim() ? row.city.trim() : null;
    map.set(row.id as string, city);
  }
  return map;
}

async function loadCommentCountMap(
  db: SupabaseClient,
  trackIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (trackIds.length === 0) return map;

  const { data, error } = await db
    .from("track_comments")
    .select("track_id")
    .in("track_id", trackIds);

  if (error || !data) return map;
  for (const row of data) {
    const tid = row.track_id as string;
    map.set(tid, (map.get(tid) ?? 0) + 1);
  }
  return map;
}

async function loadStreamsInWindow(
  db: SupabaseClient,
  trackIds: string[],
  artistByTrack: Map<string, string | null>,
  sinceIso: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (trackIds.length === 0) return counts;

  const { data, error } = await db
    .from("plays")
    .select("track_id, listener_id, created_at")
    .in("track_id", trackIds)
    .gte("created_at", sinceIso);

  if (error || !data) return counts;

  const listenerIds = [
    ...new Set(
      data
        .map((p) => p.listener_id as string | null)
        .filter(Boolean) as string[],
    ),
  ];
  const chartOptIn = new Map<string, boolean>();
  if (listenerIds.length > 0) {
    const { data: privacyRows } = await db
      .from("users")
      .select("id, privacy_show_on_charts")
      .in("id", listenerIds);
    for (const u of privacyRows ?? []) {
      chartOptIn.set(
        u.id as string,
        u.privacy_show_on_charts !== false,
      );
    }
  }

  for (const p of data) {
    const tid = p.track_id as string;
    const listenerId = p.listener_id as string | null;
    const artistId = artistByTrack.get(tid) ?? null;
    if (listenerId && artistId && listenerId === artistId) continue;
    if (
      listenerId &&
      chartOptIn.has(listenerId) &&
      chartOptIn.get(listenerId) === false
    ) {
      continue;
    }
    counts.set(tid, (counts.get(tid) ?? 0) + 1);
  }
  return counts;
}

function merchFormatPoints(format: string | null | undefined): number {
  if (format === "album") return PURCHASE_SCORE_POINTS.album;
  if (format === "cd") return PURCHASE_SCORE_POINTS.cd;
  if (format === "vinyl") return PURCHASE_SCORE_POINTS.vinyl;
  return 0;
}

async function loadPurchasesInWindow(
  db: SupabaseClient,
  trackIds: string[],
  sinceIso: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (trackIds.length === 0) return counts;

  const trackSet = new Set(trackIds);

  const { data: downloads, error: dlError } = await db
    .from("track_download_purchases")
    .select("track_id")
    .in("track_id", trackIds)
    .eq("status", "confirmed")
    .gte("created_at", sinceIso);

  if (!dlError && downloads) {
    for (const row of downloads) {
      const tid = row.track_id as string;
      if (!trackSet.has(tid)) continue;
      counts.set(
        tid,
        (counts.get(tid) ?? 0) + PURCHASE_SCORE_POINTS.song,
      );
    }
  }

  const { data: merchPurchases, error: merchError } = await db
    .from("merch_purchases")
    .select("id, artist_merch_items ( track_id, music_format )")
    .eq("status", "confirmed")
    .gte("created_at", sinceIso);

  if (!merchError && merchPurchases) {
    for (const row of merchPurchases) {
      const item = row.artist_merch_items as
        | { track_id?: string | null; music_format?: string | null }
        | { track_id?: string | null; music_format?: string | null }[]
        | null;
      const merch = Array.isArray(item) ? item[0] : item;
      const tid = merch?.track_id;
      const format = merch?.music_format;
      if (!tid || !trackSet.has(tid)) continue;
      const pts = merchFormatPoints(format);
      if (pts <= 0) continue;
      counts.set(tid, (counts.get(tid) ?? 0) + pts);
    }
  }

  return counts;
}

async function loadEditorialBoostMap(
  db: SupabaseClient,
  trackIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const id of trackIds) map.set(id, 0);

  const { data, error } = await db
    .from("tracks")
    .select("id, editorial_boost")
    .in("id", trackIds);

  if (error) {
    if (/editorial_boost|column .* does not exist/i.test(error.message)) {
      return map;
    }
    return map;
  }
  for (const row of data ?? []) {
    const boost = Number(row.editorial_boost);
    map.set(row.id as string, Number.isFinite(boost) ? Math.max(0, boost) : 0);
  }
  return map;
}

export type BuildScoreInputsOptions = {
  cadence: StandingsCadence;
  board: {
    kind: "neighborhood" | "city" | "genre" | "alkebulan" | "global";
    placeKeys?: readonly string[];
    genre?: string | null;
    neighborhoodCity?: string | null;
  };
  countriesByArtist: Map<string, string[]>;
};

/** Load raw metrics and cultural context for RECT SCORE on a track cohort. */
export async function buildTrackScoreInputs(
  db: SupabaseClient,
  tracks: TrackRow[],
  options: BuildScoreInputsOptions,
): Promise<TrackScoreInputs[]> {
  const ids = tracks.map((t) => t.id);
  const artistIds = [
    ...new Set(tracks.map((t) => t.artist_id).filter(Boolean) as string[]),
  ];
  const artistByTrack = new Map(
    tracks.map((t) => [t.id, t.artist_id] as const),
  );
  const sinceIso = windowStartIso(options.cadence);

  const [streams, likes, comments, purchases, editorial, cities] = await Promise.all([
    loadStreamsInWindow(db, ids, artistByTrack, sinceIso),
    loadLikeCountMap(db, ids),
    loadCommentCountMap(db, ids),
    loadPurchasesInWindow(db, ids, sinceIso),
    loadEditorialBoostMap(db, ids),
    loadArtistCityMap(db, artistIds),
  ]);

  return tracks.map((track) => {
    const artistId = track.artist_id;
    const countries = artistId
      ? (options.countriesByArtist.get(artistId) ?? [])
      : [];
    const city = artistId ? (cities.get(artistId) ?? null) : null;
    return {
      trackId: track.id,
      streamsInWindow: streams.get(track.id) ?? 0,
      likes: likes.get(track.id) ?? 0,
      comments: comments.get(track.id) ?? 0,
      purchasesInWindow: purchases.get(track.id) ?? 0,
      editorialBoost: editorial.get(track.id) ?? 0,
      publishedAt: track.created_at ?? null,
      culturalRaw: culturalResonanceRaw(
        track,
        countries,
        city,
        options.board,
      ),
    };
  });
}

export async function loadArtistCountriesForScores(
  db: SupabaseClient,
  artistIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (artistIds.length === 0) return map;

  const { data, error } = await db
    .from("users")
    .select("id, countries")
    .in("id", artistIds);

  if (error || !data) return map;
  for (const row of data) {
    map.set(row.id as string, normalizeTasteList(row.countries));
  }
  return map;
}

/** Language overlap helper for global cultural signal. */
export function languageCulturalBonus(
  trackLanguage: string | null | undefined,
  preferredLanguages: string[],
): number {
  if (!trackLanguage?.trim() || preferredLanguages.length === 0) return 0;
  return trackMatchesLanguage(trackLanguage, preferredLanguages[0]!)
    ? 10
    : 0;
}
