import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import {
  artistMatchesPlaces,
  DAKAR_CHART_PLACES,
  placeOverlapScore,
} from "@/lib/dashboard/charts";
import { trackMatchesGenre } from "@/lib/dashboard/genres";
import { trackMatchesLanguage } from "@/lib/dashboard/languages";
import { loadLikeCountMap } from "@/lib/dashboard/likes";
import {
  activeDaypartFromTaste,
  daypartSoftScore,
  genreOverlapScore,
  languageOverlapScore,
  normalizeTasteList,
  type ListenerTaste,
} from "@/lib/dashboard/taste";
import {
  isDemoTrack,
  isPublishedTrack,
  trackArtist,
  trackTitle,
  withLiveCatalogTracks,
  type TrackRow,
} from "@/lib/tracks";

export type RankedTrack = TrackRow & {
  play_count: number;
  like_count: number;
  artist_name: string | null;
};

export type TracksLoadResult =
  | {
      ok: true;
      tracks: RankedTrack[];
      empty: boolean;
      error: null;
      source: "plays_aggregate";
    }
  | {
      ok: false;
      tracks: [];
      empty: true;
      error: string;
      source: null;
    };

export type RankedTracksOptions = {
  /** Only include tracks whose artist countries match any of these places. */
  placeKeys?: readonly string[];
  /** Default plays; newest sorts by created_at then plays. */
  sort?: "plays" | "newest";
  /** Hard filter to tracks.language (slug or display name). */
  language?: string | null;
  /** Hard filter to tracks.genre (slug or display name). */
  genre?: string | null;
  /** Hard filter to artist countries (slug or display name). */
  place?: string | null;
};

const TRACK_SELECT =
  "id, title, audio_url, cover_art_url, genre, language, artist_id, duration_secs, status, created_at";
const TRACK_SELECT_LEAN =
  "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at";

async function loadArtistCountriesMap(
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

/**
 * Rank tracks by play volume (counts from public.plays).
 * Prefer service-role reader so RLS on plays does not zero-out charts.
 * Optional taste boosts genre + place matches for "For You".
 * Optional placeKeys scopes boards (Dakar / Alkebulan).
 */
export async function loadRankedTracks(
  supabase: SupabaseClient,
  limit: number,
  taste?: ListenerTaste | null,
  options?: RankedTracksOptions,
): Promise<TracksLoadResult> {
  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;
    const placeKeys = options?.placeKeys ?? [];
    const sort = options?.sort ?? "plays";
    const languageFilter = options?.language?.trim() || null;
    const genreFilter = options?.genre?.trim() || null;
    const placeFilter = options?.place?.trim() || null;

    const { data, error } = await withLiveCatalogTracks(
      db.from("tracks").select(TRACK_SELECT),
    )
      .order("created_at", { ascending: false })
      .limit(200);

    let trackRows = data;
    let trackError = error;
    if (
      error &&
      /content_kind|language|column .* does not exist/i.test(error.message)
    ) {
      const skipKind = /content_kind/i.test(error.message);
      const lean = await withLiveCatalogTracks(
        db.from("tracks").select(TRACK_SELECT_LEAN),
        { includePodcasts: skipKind },
      )
        .order("created_at", { ascending: false })
        .limit(200);
      trackRows = lean.data as typeof trackRows;
      trackError = lean.error;
    }

    if (trackError) {
      return {
        ok: false,
        tracks: [],
        empty: true,
        error: trackError.message,
        source: null,
      };
    }

    let rows = ((trackRows ?? []) as TrackRow[]).filter(
      (t) => isPublishedTrack(t) && !isDemoTrack(t),
    );

    const artistIds = [
      ...new Set(rows.map((r) => r.artist_id).filter(Boolean) as string[]),
    ];
    const countriesByArtist = await loadArtistCountriesMap(db, artistIds);

    if (placeKeys.length > 0) {
      rows = rows.filter((t) => {
        if (!t.artist_id) return false;
        return artistMatchesPlaces(
          countriesByArtist.get(t.artist_id) ?? [],
          placeKeys,
        );
      });
    }

    if (placeFilter) {
      rows = rows.filter((t) => {
        if (!t.artist_id) return false;
        return artistMatchesPlaces(
          countriesByArtist.get(t.artist_id) ?? [],
          [placeFilter],
        );
      });
    }

    if (languageFilter) {
      rows = rows.filter((t) =>
        trackMatchesLanguage(t.language, languageFilter),
      );
    }

    if (genreFilter) {
      rows = rows.filter((t) => trackMatchesGenre(t.genre, genreFilter));
    }

    if (rows.length === 0) {
      return {
        ok: true,
        tracks: [],
        empty: true,
        error: null,
        source: "plays_aggregate",
      };
    }

    const nameById = new Map<string, string>();
    if (artistIds.length > 0) {
      const map = await loadArtistCreditMap(db, artistIds);
      for (const [id, name] of map) nameById.set(id, name);
    }

    const ids = rows.map((r) => r.id);
    const counts = new Map<string, number>();

    // Prefer aggregate view when available (filters chart-opted-out listeners)
    const viewRes = await db
      .from("track_play_counts")
      .select("track_id, play_count")
      .in("track_id", ids);

    if (!viewRes.error && viewRes.data) {
      for (const row of viewRes.data) {
        counts.set(row.track_id as string, Number(row.play_count) || 0);
      }
    } else {
      const { data: playRows, error: playError } = await db
        .from("plays")
        .select("track_id, listener_id")
        .in("track_id", ids);

      if (playError) {
        return {
          ok: false,
          tracks: [],
          empty: true,
          error: `Could not load play counts: ${playError.message}`,
          source: null,
        };
      }

      const listenerIds = [
        ...new Set(
          (playRows ?? [])
            .map((p) => p.listener_id as string | null)
            .filter(Boolean) as string[],
        ),
      ];
      const chartOptIn = new Map<string, boolean>();
      if (listenerIds.length > 0) {
        const { data: privacyRows, error: privacyError } = await db
          .from("users")
          .select("id, privacy_show_on_charts")
          .in("id", listenerIds);
        if (privacyError) {
          return {
            ok: false,
            tracks: [],
            empty: true,
            error: `Could not load chart privacy: ${privacyError.message}`,
            source: null,
          };
        }
        for (const u of privacyRows ?? []) {
          chartOptIn.set(
            u.id as string,
            u.privacy_show_on_charts !== false,
          );
        }
      }

      const artistByTrack = new Map(
        rows.map((r) => [r.id, r.artist_id] as const),
      );

      for (const p of playRows ?? []) {
        const listenerId = p.listener_id as string | null;
        const tid = p.track_id as string;
        const artistId = artistByTrack.get(tid);
        // Artist checking own mix — never chart
        if (listenerId && artistId && listenerId === artistId) {
          continue;
        }
        // Missing profile → count (same as coalesce(..., true) in SQL view)
        if (
          listenerId &&
          chartOptIn.has(listenerId) &&
          chartOptIn.get(listenerId) === false
        ) {
          continue;
        }
        counts.set(tid, (counts.get(tid) ?? 0) + 1);
      }
    }

    const preferredGenres = taste?.genres ?? [];
    const preferredPlaces = taste?.countries ?? [];
    const preferredLanguages = taste?.languages ?? [];
    const activeDaypart = activeDaypartFromTaste(taste);
    const likeCounts = await loadLikeCountMap(db, ids);

    const ranked: RankedTrack[] = rows
      .map((r) => ({
        ...r,
        artist_name: r.artist_id
          ? (nameById.get(r.artist_id) ?? null)
          : null,
        play_count: counts.get(r.id) ?? 0,
        like_count: likeCounts.get(r.id) ?? 0,
      }))
      .filter((t) => !isDemoTrack(t))
      .sort((a, b) => {
        const dayA = activeDaypart ? daypartSoftScore(activeDaypart, a) : 0;
        const dayB = activeDaypart ? daypartSoftScore(activeDaypart, b) : 0;

        if (sort === "newest") {
          const byDate = (b.created_at || "").localeCompare(a.created_at || "");
          if (byDate !== 0) return byDate;
          return (
            dayB - dayA ||
            b.play_count - a.play_count ||
            b.like_count - a.like_count
          );
        }

        const placeA = placeOverlapScore(
          a.artist_id ? (countriesByArtist.get(a.artist_id) ?? []) : [],
          preferredPlaces,
        );
        const placeB = placeOverlapScore(
          b.artist_id ? (countriesByArtist.get(b.artist_id) ?? []) : [],
          preferredPlaces,
        );
        const tasteA = genreOverlapScore([a.genre], preferredGenres);
        const tasteB = genreOverlapScore([b.genre], preferredGenres);
        const langA = languageOverlapScore([a.language], preferredLanguages);
        const langB = languageOverlapScore([b.language], preferredLanguages);
        return (
          placeB - placeA ||
          tasteB - tasteA ||
          langB - langA ||
          dayB - dayA ||
          b.play_count - a.play_count ||
          b.like_count - a.like_count ||
          (b.created_at || "").localeCompare(a.created_at || "")
        );
      })
      .slice(0, limit);

    return {
      ok: true,
      tracks: ranked,
      empty: ranked.length === 0,
      error: null,
      source: "plays_aggregate",
    };
  } catch (e) {
    return {
      ok: false,
      tracks: [],
      empty: true,
      error: e instanceof Error ? e.message : "Failed to load tracks",
      source: null,
    };
  }
}

/** CONNECTION 2 — featured / For You (taste + daypart soft-boosted by play_count). */
export async function loadFeaturedTracks(
  supabase: SupabaseClient,
  taste?: ListenerTaste | null,
) {
  const res = await loadRankedTracks(supabase, 6, taste);
  if (res.ok && res.tracks.length > 0) return res;
  const { showcaseAsRanked } = await import("@/lib/showcase/catalog");
  const tracks = showcaseAsRanked(6);
  return {
    ok: true as const,
    tracks,
    empty: tracks.length === 0,
    error: null,
    source: "plays_aggregate" as const,
  };
}

/** CONNECTION 3 — Dakar chart (Senegal / Dakar artists by play_count). */
export async function loadDakarChart(supabase: SupabaseClient) {
  return loadRankedTracks(supabase, 7, null, {
    placeKeys: DAKAR_CHART_PLACES,
  });
}

export function formatPlayCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export { trackArtist, trackTitle };
