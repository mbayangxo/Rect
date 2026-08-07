import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoTrack, trackArtist, trackTitle, type TrackRow } from "@/lib/tracks";

export type RankedTrack = TrackRow & {
  play_count: number;
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

const TRACK_SELECT =
  "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at";

/**
 * Rank tracks by play volume (counts from public.plays).
 * Prefer service-role reader so RLS on plays does not zero-out charts.
 */
export async function loadRankedTracks(
  supabase: SupabaseClient,
  limit: number,
): Promise<TracksLoadResult> {
  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;

    const { data, error } = await db
      .from("tracks")
      .select(TRACK_SELECT)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return {
        ok: false,
        tracks: [],
        empty: true,
        error: error.message,
        source: null,
      };
    }

    const rows = ((data ?? []) as TrackRow[]).filter((t) => !isDemoTrack(t));
    if (rows.length === 0) {
      return {
        ok: true,
        tracks: [],
        empty: true,
        error: null,
        source: "plays_aggregate",
      };
    }

    const artistIds = [
      ...new Set(rows.map((r) => r.artist_id).filter(Boolean) as string[]),
    ];
    const nameById = new Map<string, string>();
    if (artistIds.length > 0) {
      const { data: artists, error: artistError } = await db
        .from("users")
        .select("id, display_name")
        .in("id", artistIds);
      if (artistError) {
        return {
          ok: false,
          tracks: [],
          empty: true,
          error: artistError.message,
          source: null,
        };
      }
      for (const a of artists ?? []) {
        if (a.display_name) nameById.set(a.id, a.display_name);
      }
    }

    const ids = rows.map((r) => r.id);
    const counts = new Map<string, number>();

    // Prefer aggregate view when available
    const viewRes = await db
      .from("track_play_counts")
      .select("track_id, play_count")
      .in("track_id", ids);

    if (!viewRes.error && viewRes.data) {
      for (const row of viewRes.data) {
        counts.set(
          row.track_id as string,
          Number(row.play_count) || 0,
        );
      }
    } else {
      const { data: playRows, error: playError } = await db
        .from("plays")
        .select("track_id")
        .in("track_id", ids);

      if (playError) {
        for (const id of ids) counts.set(id, 0);
      } else {
        for (const p of playRows ?? []) {
          const tid = p.track_id as string;
          counts.set(tid, (counts.get(tid) ?? 0) + 1);
        }
      }
    }

    const ranked: RankedTrack[] = rows
      .map((r) => ({
        ...r,
        artist_name: r.artist_id
          ? (nameById.get(r.artist_id) ?? null)
          : null,
        play_count: counts.get(r.id) ?? 0,
      }))
      .filter((t) => !isDemoTrack(t))
      .sort(
        (a, b) =>
          b.play_count - a.play_count ||
          (b.created_at || "").localeCompare(a.created_at || ""),
      )
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

/** CONNECTION 2 — featured / now-playing (top 6 by play_count). */
export async function loadFeaturedTracks(supabase: SupabaseClient) {
  return loadRankedTracks(supabase, 6);
}

/** CONNECTION 3 — Dakar chart preview (top 7 by play_count). */
export async function loadDakarChart(supabase: SupabaseClient) {
  return loadRankedTracks(supabase, 7);
}

export function formatPlayCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export { trackArtist, trackTitle };
