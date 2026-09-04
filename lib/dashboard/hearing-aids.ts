import type { SupabaseClient } from "@supabase/supabase-js";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isDemoTrack,
  isPublishedTrack,
  isTrackLaunched,
  type TrackRow,
} from "@/lib/tracks";

export type HearingAidEpisode = TrackRow & {
  artist_name: string | null;
};

/**
 * Hearing Aids — on-demand podcast / talk episodes (not Wave live radio).
 */
export async function loadHearingAidEpisodes(
  supabase: SupabaseClient,
  limit = 40,
): Promise<{ episodes: HearingAidEpisode[]; error: string | null; missingColumn: boolean }> {
  const admin = createAdminClient();
  const db = admin ?? supabase;

  const { data, error } = await db
    .from("tracks")
    .select(
      "id, title, audio_url, cover_art_url, genre, language, artist_id, duration_secs, status, created_at, launch_at, content_kind",
    )
    .eq("content_kind", "podcast")
    .or("status.eq.live,status.eq.published,status.is.null")
    .not("audio_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(Math.max(limit * 2, 40));

  if (error) {
    if (/content_kind|column .* does not exist/i.test(error.message)) {
      return { episodes: [], error: null, missingColumn: true };
    }
    return { episodes: [], error: error.message, missingColumn: false };
  }

  const rows = ((data ?? []) as TrackRow[])
    .filter((t) => isPublishedTrack(t) && !isDemoTrack(t) && isTrackLaunched(t))
    .slice(0, limit);

  const artistIds = [
    ...new Set(rows.map((t) => t.artist_id).filter(Boolean) as string[]),
  ];
  const nameById = await loadArtistCreditMap(db, artistIds);

  return {
    episodes: rows.map((t) => ({
      ...t,
      artist_name: t.artist_id ? (nameById.get(t.artist_id) ?? null) : null,
    })),
    error: null,
    missingColumn: false,
  };
}
