import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { loadLikeCountMap } from "@/lib/dashboard/likes";
import {
  genreOverlapScore,
  type ListenerTaste,
} from "@/lib/dashboard/taste";
import {
  isDemoTrack,
  isPublishedTrack,
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

/**
 * Newest published tracks — First Light / New releases shelf.
 * Optional taste gently boosts matching genres without hiding others.
 */
export async function loadNewReleases(
  supabase: SupabaseClient,
  limit = 30,
  taste?: ListenerTaste | null,
): Promise<NewReleasesResult> {
  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;

    const { data, error } = await db
      .from("tracks")
      .select(
        "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(Math.max(limit * 3, 80));

    if (error) {
      return { tracks: [], error: error.message };
    }

    const rows = ((data ?? []) as TrackRow[]).filter(
      (t) => isPublishedTrack(t) && !isDemoTrack(t),
    );

    const preferred = taste?.genres ?? [];
    const sorted = [...rows].sort((a, b) => {
      const tasteA = genreOverlapScore([a.genre], preferred);
      const tasteB = genreOverlapScore([b.genre], preferred);
      return (
        // Recency first, then light taste boost among same-day peers
        (b.created_at || "").localeCompare(a.created_at || "") ||
        tasteB - tasteA
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
