import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { artistMatchesPlaces } from "@/lib/dashboard/charts";
import { loadLikeCountMap } from "@/lib/dashboard/likes";
import {
  genreOverlapScore,
  languageOverlapScore,
  normalizeTasteList,
  type ListenerTaste,
} from "@/lib/dashboard/taste";
import { trackMatchesGenre } from "@/lib/dashboard/genres";
import { trackMatchesLanguage } from "@/lib/dashboard/languages";
import {
  isDemoTrack,
  isPublishedTrack,
  withLiveCatalogTracks,
  type TrackRow,
} from "@/lib/tracks";

export type NewReleaseTrack = TrackRow & {
  artist_name: string | null;
  like_count: number;
};

export type NewReleasesResult = {
  tracks: NewReleaseTrack[];
  error: string | null;
};

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
 * Newest published tracks — First Light / New releases shelf.
 * Optional taste gently boosts matching genres/languages without hiding others.
 */
export async function loadNewReleases(
  supabase: SupabaseClient,
  limit = 30,
  taste?: ListenerTaste | null,
  language?: string | null,
  genre?: string | null,
  place?: string | null,
): Promise<NewReleasesResult> {
  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;
    const languageFilter = language?.trim() || null;
    const genreFilter = genre?.trim() || null;
    const placeFilter = place?.trim() || null;

    const { data, error } = await withLiveCatalogTracks(
      db
        .from("tracks")
        .select(
          "id, title, audio_url, cover_art_url, genre, language, artist_id, duration_secs, status, created_at",
        ),
    )
      .order("created_at", { ascending: false })
      .limit(Math.max(limit * 3, 80));

    let trackData = data;
    let trackError = error;
    if (
      error &&
      /language|column .* does not exist/i.test(error.message)
    ) {
      const lean = await withLiveCatalogTracks(
        db
          .from("tracks")
          .select(
            "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
          ),
      )
        .order("created_at", { ascending: false })
        .limit(Math.max(limit * 3, 80));
      trackData = lean.data as typeof trackData;
      trackError = lean.error;
    }

    if (trackError) {
      return { tracks: [], error: trackError.message };
    }

    let rows = ((trackData ?? []) as TrackRow[]).filter(
      (t) =>
        isPublishedTrack(t) &&
        !isDemoTrack(t) &&
        trackMatchesLanguage(t.language, languageFilter) &&
        trackMatchesGenre(t.genre, genreFilter),
    );

    if (placeFilter) {
      const artistIds = [
        ...new Set(rows.map((t) => t.artist_id).filter(Boolean) as string[]),
      ];
      const countriesByArtist = await loadArtistCountriesMap(db, artistIds);
      rows = rows.filter((t) => {
        if (!t.artist_id) return false;
        return artistMatchesPlaces(
          countriesByArtist.get(t.artist_id) ?? [],
          [placeFilter],
        );
      });
    }

    const preferred = taste?.genres ?? [];
    const preferredLangs = taste?.languages ?? [];
    const sorted = [...rows].sort((a, b) => {
      const tasteA = genreOverlapScore([a.genre], preferred);
      const tasteB = genreOverlapScore([b.genre], preferred);
      const langA = languageOverlapScore([a.language], preferredLangs);
      const langB = languageOverlapScore([b.language], preferredLangs);
      return (
        (b.created_at || "").localeCompare(a.created_at || "") ||
        tasteB - tasteA ||
        langB - langA
      );
    });

    const sliced = sorted.slice(0, limit);
    const artistIds = [
      ...new Set(sliced.map((t) => t.artist_id).filter(Boolean) as string[]),
    ];
    const nameById = await loadArtistCreditMap(db, artistIds);
    const likes = await loadLikeCountMap(
      db,
      sliced.map((t) => t.id),
    );

    return {
      tracks: sliced.map((t) => ({
        ...t,
        artist_name: t.artist_id
          ? (nameById.get(t.artist_id) ?? null)
          : null,
        like_count: likes.get(t.id) ?? 0,
      })),
      error: null,
    };
  } catch (e) {
    return {
      tracks: [],
      error: e instanceof Error ? e.message : "Failed to load new releases",
    };
  }
}

export function formatReleasedAt(iso: string | null | undefined) {
  if (!iso) return "Recently";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Recently";
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return mins < 1 ? "Just now" : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
