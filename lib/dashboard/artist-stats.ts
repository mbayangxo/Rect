import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoTrack, isPublishedTrack, type TrackRow } from "@/lib/tracks";

export type ArtistStatTrack = TrackRow & {
  play_count: number;
  plays_this_month: number;
};

export type ArtistStudioStats = {
  tracks: ArtistStatTrack[];
  totalPlays: number;
  playsThisMonth: number;
  uniqueListeners: number;
  followerCount: number;
  publishedCount: number;
  draftCount: number;
  topTracks: ArtistStatTrack[];
  followsReady: boolean;
  error: string | null;
};

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205/i.test(
    message,
  );
}

function startOfMonthIso() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

/**
 * Artist studio analytics — plays + follows for the logged-in artist.
 */
export async function loadArtistStudioStats(
  supabase: SupabaseClient,
  artistId: string,
): Promise<ArtistStudioStats> {
  const empty: ArtistStudioStats = {
    tracks: [],
    totalPlays: 0,
    playsThisMonth: 0,
    uniqueListeners: 0,
    followerCount: 0,
    publishedCount: 0,
    draftCount: 0,
    topTracks: [],
    followsReady: true,
    error: null,
  };

  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;

    const { data: trackData, error: trackError } = await db
      .from("tracks")
      .select(
        "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
      )
      .eq("artist_id", artistId)
      .order("created_at", { ascending: false });

    if (trackError) {
      return { ...empty, error: trackError.message };
    }

    const rows = ((trackData ?? []) as TrackRow[]).filter(
      (t) => !isDemoTrack(t),
    );
    const publishedCount = rows.filter((t) => isPublishedTrack(t)).length;
    const draftCount = rows.length - publishedCount;

    if (rows.length === 0) {
      const followers = await loadFollowerCountSafe(db, artistId);
      return {
        ...empty,
        publishedCount: 0,
        draftCount: 0,
        followerCount: followers.count,
        followsReady: followers.ready,
      };
    }

    const ids = rows.map((r) => r.id);
    const monthStart = startOfMonthIso();

    type PlayRow = {
      track_id: string;
      listener_id?: string | null;
      created_at?: string | null;
    };

    let playRows: PlayRow[] = [];
    const playsRes = await db
      .from("plays")
      .select("track_id, listener_id, created_at")
      .in("track_id", ids);

    if (playsRes.error) {
      const lean = await db.from("plays").select("track_id").in("track_id", ids);
      if (lean.error) {
        // Still return tracks without play stats
        const tracks = rows.map((r) => ({
          ...r,
          play_count: 0,
          plays_this_month: 0,
        }));
        const followers = await loadFollowerCountSafe(db, artistId);
        return {
          ...empty,
          tracks,
          publishedCount,
          draftCount,
          followerCount: followers.count,
          followsReady: followers.ready,
          error: playsRes.error.message,
        };
      }
      playRows = (lean.data ?? []) as PlayRow[];
    } else {
      playRows = (playsRes.data ?? []) as PlayRow[];
    }

    const totalByTrack = new Map<string, number>();
    const monthByTrack = new Map<string, number>();
    const listeners = new Set<string>();
    let playsThisMonth = 0;

    for (const p of playRows) {
      const tid = p.track_id as string;
      totalByTrack.set(tid, (totalByTrack.get(tid) ?? 0) + 1);
      if (p.listener_id) listeners.add(p.listener_id);
      const at = p.created_at;
      if (at && at >= monthStart) {
        playsThisMonth += 1;
        monthByTrack.set(tid, (monthByTrack.get(tid) ?? 0) + 1);
      }
    }

    const tracks: ArtistStatTrack[] = rows.map((r) => ({
      ...r,
      play_count: totalByTrack.get(r.id) ?? 0,
      plays_this_month: monthByTrack.get(r.id) ?? 0,
    }));

    const totalPlays = tracks.reduce((s, t) => s + t.play_count, 0);
    const topTracks = [...tracks]
      .sort(
        (a, b) =>
          b.play_count - a.play_count ||
          (b.created_at ?? "").localeCompare(a.created_at ?? ""),
      )
      .filter((t) => t.play_count > 0)
      .slice(0, 5);

    const followers = await loadFollowerCountSafe(db, artistId);

    return {
      tracks,
      totalPlays,
      playsThisMonth,
      uniqueListeners: listeners.size,
      followerCount: followers.count,
      publishedCount,
      draftCount,
      topTracks,
      followsReady: followers.ready,
      error: null,
    };
  } catch (e) {
    return {
      ...empty,
      error: e instanceof Error ? e.message : "Failed to load studio stats",
    };
  }
}

async function loadFollowerCountSafe(
  db: SupabaseClient,
  artistId: string,
): Promise<{ count: number; ready: boolean }> {
  const { count, error } = await db
    .from("artist_follows")
    .select("follower_id", { count: "exact", head: true })
    .eq("artist_id", artistId);

  if (error) {
    if (isMissingRelation(error.message)) {
      return { count: 0, ready: false };
    }
    return { count: 0, ready: true };
  }
  return { count: count ?? 0, ready: true };
}
