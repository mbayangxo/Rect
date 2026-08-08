import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import {
  genreOverlapScore,
  normalizeGenreKey,
  type ListenerTaste,
} from "@/lib/dashboard/taste";
import {
  isDemoTrack,
  isPublishedTrack,
  type TrackRow,
} from "@/lib/tracks";

export type RadioStation = {
  id: string;
  label: string;
  subtitle: string;
  genre: string | null;
  tracks: TrackRow[];
  forYou: boolean;
};

export type RadioLoadResult = {
  stations: RadioStation[];
  error: string | null;
};

const FALLBACK_GENRES = [
  "Afrobeats",
  "Amapiano",
  "Mbalax",
  "Afrohouse",
  "Hip-Hop",
];

/**
 * Build radio stations from published tracks.
 * Prefer listener taste genres; fill with catalog genres / fallbacks.
 */
export async function loadRadioStations(
  supabase: SupabaseClient,
  taste?: ListenerTaste | null,
): Promise<RadioLoadResult> {
  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;

    const { data, error } = await db
      .from("tracks")
      .select(
        "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(120);

    if (error) {
      return { stations: [], error: error.message };
    }

    const rows = ((data ?? []) as TrackRow[]).filter(
      (t) => isPublishedTrack(t) && !isDemoTrack(t) && Boolean(t.audio_url),
    );

    const artistIds = [
      ...new Set(rows.map((r) => r.artist_id).filter(Boolean) as string[]),
    ];
    const nameById = await loadArtistCreditMap(db, artistIds);
    const tracks = rows.map((r) => ({
      ...r,
      artist_name: r.artist_id ? (nameById.get(r.artist_id) ?? null) : null,
    }));

    const preferred = taste?.genres ?? [];
    const catalogGenres = [
      ...new Set(
        tracks
          .map((t) => t.genre?.trim())
          .filter((g): g is string => Boolean(g)),
      ),
    ];

    const stationLabels: { label: string; forYou: boolean }[] = [];
    const seen = new Set<string>();

    for (const g of preferred) {
      const key = normalizeGenreKey(g);
      if (seen.has(key)) continue;
      seen.add(key);
      stationLabels.push({ label: g, forYou: true });
    }
    for (const g of catalogGenres) {
      const key = normalizeGenreKey(g);
      if (seen.has(key)) continue;
      seen.add(key);
      stationLabels.push({ label: g, forYou: false });
      if (stationLabels.length >= 8) break;
    }
    for (const g of FALLBACK_GENRES) {
      if (stationLabels.length >= 6) break;
      const key = normalizeGenreKey(g);
      if (seen.has(key)) continue;
      seen.add(key);
      stationLabels.push({ label: g, forYou: false });
    }

    const stations: RadioStation[] = stationLabels
      .map((s, i) => {
        const matched = tracks
          .filter(
            (t) =>
              genreOverlapScore([t.genre], [s.label]) > 0 ||
              (!t.genre && s.forYou && i === 0),
          )
          .slice(0, 12);

        // Soft fill: if taste genre has no tracks yet, use top plays-ish (newest)
        const playlist =
          matched.length > 0
            ? matched
            : tracks.slice(i * 3, i * 3 + 8).filter(Boolean);

        return {
          id: `station-${normalizeGenreKey(s.label).replace(/\s+/g, "-")}`,
          label: s.label,
          subtitle: s.forYou
            ? "Tuned to your taste"
            : playlist.length
              ? `${playlist.length} tracks`
              : "Coming online",
          genre: s.label,
          tracks: playlist,
          forYou: s.forYou,
        };
      })
      .filter((s) => s.tracks.length > 0)
      .slice(0, 8);

    // Always offer a mixed "The Current" if we have any tracks
    if (tracks.length > 0) {
      stations.unshift({
        id: "station-current",
        label: "The Current",
        subtitle: "Mixed published signal",
        genre: null,
        tracks: tracks.slice(0, 16),
        forYou: false,
      });
    }

    return { stations: stations.slice(0, 9), error: null };
  } catch (e) {
    return {
      stations: [],
      error: e instanceof Error ? e.message : "Failed to load radio",
    };
  }
}
