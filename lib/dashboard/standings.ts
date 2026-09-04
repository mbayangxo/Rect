import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ALKEBULAN_CHART_PLACES,
  artistMatchesPlaces,
  DAKAR_CHART_PLACES,
} from "@/lib/dashboard/charts";
import { genreToSlug, trackMatchesGenre } from "@/lib/dashboard/genres";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { loadLikeCountMap } from "@/lib/dashboard/likes";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildTrackScoreInputs,
  loadArtistCountriesForScores,
  scoreTrackCohort,
  type RectScoreBreakdown,
  type StandingsCadence,
} from "@/lib/dashboard/rect-score";
import {
  isDemoTrack,
  isPublishedTrack,
  trackTitle,
  withLiveCatalogTracks,
  type TrackRow,
} from "@/lib/tracks";

export type StandingsBoardKind =
  | "neighborhood"
  | "city"
  | "genre"
  | "alkebulan"
  | "global";

export type StandingsBoardDef = {
  id: string;
  kind: StandingsBoardKind;
  title: string;
  subtitle: string;
  cadence: StandingsCadence;
  placeKeys?: readonly string[];
  genre?: string;
  neighborhoodCity?: string;
  limit: number;
};

export const STANDINGS_BOARDS: StandingsBoardDef[] = [
  {
    id: "neighborhood",
    kind: "neighborhood",
    title: "NEIGHBORHOOD",
    subtitle: "Your block · RECT SCORE · updates daily",
    cadence: "daily",
    limit: 10,
  },
  {
    id: "city-dakar",
    kind: "city",
    title: "DAKAR STANDINGS",
    subtitle: "City pulse · RECT SCORE · updates weekly",
    cadence: "weekly",
    placeKeys: DAKAR_CHART_PLACES,
    limit: 7,
  },
  {
    id: "alkebulan",
    kind: "alkebulan",
    title: "THE ALKEBULAN",
    subtitle: "Continental pulse · RECT SCORE · updates weekly",
    cadence: "weekly",
    placeKeys: ALKEBULAN_CHART_PLACES,
    limit: 12,
  },
];

export type StandingsEntry = TrackRow & {
  artist_name: string | null;
  play_count: number;
  like_count: number;
  rect_score: number;
  rect_breakdown: RectScoreBreakdown;
  chart_position: number;
};

export type StandingsBoardResult = {
  board: StandingsBoardDef;
  entries: StandingsEntry[];
  error: string | null;
};

export type ArtistChartPosition = {
  boardId: string;
  boardTitle: string;
  cadence: StandingsCadence;
  position: number;
  trackId: string;
  trackTitle: string;
  rectScore: number;
  totalEntries: number;
};

const TRACK_SELECT =
  "id, title, audio_url, cover_art_url, genre, language, artist_id, duration_secs, status, created_at";

async function loadArtistCityMap(
  db: SupabaseClient,
  artistIds: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (artistIds.length === 0) return map;
  const { data } = await db.from("users").select("id, city").in("id", artistIds);
  for (const row of data ?? []) {
    map.set(
      row.id as string,
      typeof row.city === "string" && row.city.trim() ? row.city.trim() : null,
    );
  }
  return map;
}

async function loadCatalogTracks(db: SupabaseClient): Promise<TrackRow[]> {
  const { data, error } = await withLiveCatalogTracks(
    db.from("tracks").select(TRACK_SELECT),
  )
    .order("created_at", { ascending: false })
    .limit(300);

  let rows = data;
  if (error && /content_kind/i.test(error.message)) {
    const lean = await withLiveCatalogTracks(
      db.from("tracks").select(TRACK_SELECT),
      { includePodcasts: true },
    )
      .order("created_at", { ascending: false })
      .limit(300);
    if (lean.error) return [];
    rows = lean.data;
  } else if (error) {
    return [];
  }
  return ((rows ?? []) as TrackRow[]).filter(
    (t) => isPublishedTrack(t) && !isDemoTrack(t) && Boolean(t.audio_url),
  );
}

function filterForBoard(
  tracks: TrackRow[],
  board: StandingsBoardDef,
  countriesByArtist: Map<string, string[]>,
  citiesByArtist: Map<string, string | null>,
): TrackRow[] {
  return tracks.filter((t) => {
    if (!isPublishedTrack(t) || isDemoTrack(t) || !t.audio_url) return false;
    const artistId = t.artist_id;
    if (!artistId) return false;

    switch (board.kind) {
      case "neighborhood": {
        const city = board.neighborhoodCity;
        if (!city?.trim()) return false;
        const artistCity = citiesByArtist.get(artistId);
        if (!artistCity) return false;
        const a = artistCity.trim().toLowerCase();
        const b = city.trim().toLowerCase();
        return a === b || a.includes(b) || b.includes(a);
      }
      case "city":
      case "alkebulan":
        return artistMatchesPlaces(
          countriesByArtist.get(artistId) ?? [],
          board.placeKeys ?? [],
        );
      case "genre":
        return board.genre
          ? trackMatchesGenre(t.genre, board.genre)
          : false;
      case "global":
        return true;
      default:
        return true;
    }
  });
}

async function rankStandingsCohort(
  db: SupabaseClient,
  board: StandingsBoardDef,
  cohort: TrackRow[],
  countriesByArtist: Map<string, string[]>,
): Promise<StandingsEntry[]> {
  if (cohort.length === 0) return [];

  const scoreInputs = await buildTrackScoreInputs(db, cohort, {
    cadence: board.cadence,
    board: {
      kind: board.kind,
      placeKeys: board.placeKeys,
      genre: board.genre ?? null,
      neighborhoodCity: board.neighborhoodCity ?? null,
    },
    countriesByArtist,
  });

  const scores = scoreTrackCohort(scoreInputs);
  const artistIds = [
    ...new Set(cohort.map((t) => t.artist_id).filter(Boolean) as string[]),
  ];
  const [nameById, likes] = await Promise.all([
    loadArtistCreditMap(db, artistIds),
    loadLikeCountMap(
      db,
      cohort.map((t) => t.id),
    ),
  ]);

  return cohort
    .map((t) => {
      const breakdown = scores.get(t.id) ?? {
        streams: 0,
        engagement: 0,
        purchases: 0,
        editorial: 0,
        cultural: 0,
        total: 0,
      };
      return {
        ...t,
        artist_name: t.artist_id ? (nameById.get(t.artist_id) ?? null) : null,
        play_count:
          scoreInputs.find((s) => s.trackId === t.id)?.streamsInWindow ?? 0,
        like_count: likes.get(t.id) ?? 0,
        rect_score: breakdown.total,
        rect_breakdown: breakdown,
        chart_position: 0,
      } satisfies StandingsEntry;
    })
    .sort(
      (a, b) =>
        b.rect_score - a.rect_score ||
        b.play_count - a.play_count ||
        (b.created_at || "").localeCompare(a.created_at || ""),
    )
    .map((e, i) => ({ ...e, chart_position: i + 1 }));
}

async function loadBoardRankings(
  db: SupabaseClient,
  board: StandingsBoardDef,
): Promise<StandingsEntry[]> {
  const all = await loadCatalogTracks(db);
  const artistIds = [
    ...new Set(all.map((t) => t.artist_id).filter(Boolean) as string[]),
  ];
  const [countriesByArtist, citiesByArtist] = await Promise.all([
    loadArtistCountriesForScores(db, artistIds),
    loadArtistCityMap(db, artistIds),
  ]);

  const cohort = filterForBoard(
    all,
    board,
    countriesByArtist,
    citiesByArtist,
  );
  return rankStandingsCohort(db, board, cohort, countriesByArtist);
}

export async function loadStandingsBoard(
  supabase: SupabaseClient,
  board: StandingsBoardDef,
  options?: { neighborhoodCity?: string | null; genre?: string | null },
): Promise<StandingsBoardResult> {
  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;
    const resolved: StandingsBoardDef = {
      ...board,
      genre: options?.genre ?? board.genre,
      neighborhoodCity: options?.neighborhoodCity ?? board.neighborhoodCity,
    };

    const ranked = await loadBoardRankings(db, resolved);
    return {
      board: resolved,
      entries: ranked.slice(0, resolved.limit),
      error: null,
    };
  } catch (e) {
    return {
      board,
      entries: [],
      error: e instanceof Error ? e.message : "Failed to load standings",
    };
  }
}

export async function loadGenreStandingsBoard(
  supabase: SupabaseClient,
  genre: string,
  limit = 10,
): Promise<StandingsBoardResult> {
  return loadStandingsBoard(supabase, {
    id: `genre-${genreToSlug(genre)}`,
    kind: "genre",
    title: genre.toUpperCase(),
    subtitle: "Genre standings · RECT SCORE · updates weekly",
    cadence: "weekly",
    genre,
    limit,
  });
}

export async function loadArtistChartPositions(
  supabase: SupabaseClient,
  artistId: string,
): Promise<{ positions: ArtistChartPosition[]; error: string | null }> {
  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;

    const { data: artistRow } = await db
      .from("users")
      .select("city, genres")
      .eq("id", artistId)
      .maybeSingle();

    const city =
      typeof artistRow?.city === "string" && artistRow.city.trim()
        ? artistRow.city.trim()
        : null;
    const genres = Array.isArray(artistRow?.genres)
      ? artistRow.genres.filter(
          (g): g is string => typeof g === "string" && g.trim().length > 0,
        )
      : [];

    const { data: artistTracks } = await db
      .from("tracks")
      .select("id, status, audio_url")
      .eq("artist_id", artistId);

    const trackIds = new Set(
      (artistTracks ?? [])
        .filter(
          (t) =>
            isPublishedTrack(t as TrackRow) &&
            typeof t.audio_url === "string" &&
            t.audio_url.trim(),
        )
        .map((t) => t.id as string),
    );

    if (trackIds.size === 0) {
      return { positions: [], error: null };
    }

    const boardsToLoad: StandingsBoardDef[] = [];

    if (city) {
      boardsToLoad.push({
        ...STANDINGS_BOARDS[0]!,
        neighborhoodCity: city,
      });
    }

    boardsToLoad.push(STANDINGS_BOARDS[1]!, STANDINGS_BOARDS[2]!);

    for (const genre of genres.slice(0, 4)) {
      boardsToLoad.push({
        id: `genre-${genreToSlug(genre)}`,
        kind: "genre",
        title: `${genre} STANDINGS`,
        subtitle: "Genre · weekly",
        cadence: "weekly",
        genre,
        limit: 15,
      });
    }

    const positions: ArtistChartPosition[] = [];

    for (const board of boardsToLoad) {
      const ranked = await loadBoardRankings(db, board);
      for (const entry of ranked) {
        if (!trackIds.has(entry.id) || entry.artist_id !== artistId) continue;
        positions.push({
          boardId: board.id,
          boardTitle: board.title,
          cadence: board.cadence,
          position: entry.chart_position,
          trackId: entry.id,
          trackTitle: trackTitle(entry),
          rectScore: Math.round(entry.rect_score * 10) / 10,
          totalEntries: ranked.length,
        });
      }
    }

    positions.sort(
      (a, b) => a.position - b.position || b.rectScore - a.rectScore,
    );

    return { positions, error: null };
  } catch (e) {
    return {
      positions: [],
      error: e instanceof Error ? e.message : "Failed to load chart positions",
    };
  }
}

/** Rank live catalog tracks by RECT SCORE (weekly global standings). */
export async function loadRectScoreRankedTracks(
  supabase: SupabaseClient,
  limit: number,
  options?: {
    placeKeys?: readonly string[];
    genre?: string | null;
    cadence?: StandingsCadence;
    kind?: StandingsBoardKind;
  },
): Promise<StandingsEntry[]> {
  const admin = createAdminClient();
  const db = admin ?? supabase;
  const board: StandingsBoardDef = {
    id: "standings",
    kind: options?.kind ?? (options?.genre ? "genre" : options?.placeKeys ? "city" : "alkebulan"),
    title: "STANDINGS",
    subtitle: "RECT SCORE",
    cadence: options?.cadence ?? "weekly",
    placeKeys: options?.placeKeys,
    genre: options?.genre ?? undefined,
    limit,
  };
  const ranked = await loadBoardRankings(db, board);
  return ranked.slice(0, limit);
}
