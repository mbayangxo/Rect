import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoTrack, isPublishedTrack, type TrackRow } from "@/lib/tracks";

export type ArtistStatTrack = TrackRow & {
  play_count: number;
  plays_this_month: number;
};

export type ArtistRecentListener = {
  listener_id: string;
  display_name: string;
  track_title: string;
  track_id: string;
  play_id: string | null;
  played_at: string | null;
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
  recentListeners: ArtistRecentListener[];
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
    recentListeners: [],
    followsReady: true,
    error: null,
  };

  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;

    const { data: trackData, error: trackError } = await db
      .from("tracks")
      .select(
        "id, title, audio_url, cover_art_url, genre, language, artist_id, duration_secs, status, created_at",
      )
      .eq("artist_id", artistId)
      .order("created_at", { ascending: false });

    let rowsSource = trackData;
    let rowsError = trackError;
    if (
      trackError &&
      /language|column .* does not exist/i.test(trackError.message)
    ) {
      const lean = await db
        .from("tracks")
        .select(
          "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
        )
        .eq("artist_id", artistId)
        .order("created_at", { ascending: false });
      rowsSource = lean.data as typeof rowsSource;
      rowsError = lean.error;
    }

    if (rowsError) {
      return { ...empty, error: rowsError.message };
    }

    const rows = ((rowsSource ?? []) as TrackRow[]).filter(
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
      id?: string | number | null;
      track_id: string;
      listener_id?: string | null;
      created_at?: string | null;
    };

    let playRows: PlayRow[] = [];
    const playsRes = await db
      .from("plays")
      .select("id, track_id, listener_id, created_at")
      .in("track_id", ids);

    if (playsRes.error) {
      const lean = await db
        .from("plays")
        .select("track_id, listener_id, created_at")
        .in("track_id", ids);
      if (lean.error) {
        const bare = await db.from("plays").select("track_id").in("track_id", ids);
        if (bare.error) {
          const followers = await loadFollowerCountSafe(db, artistId);
          return {
            ...empty,
            tracks: rows.map((r) => ({
              ...r,
              play_count: 0,
              plays_this_month: 0,
            })),
            publishedCount,
            draftCount,
            followerCount: followers.count,
            followsReady: followers.ready,
            error: `Could not load plays: ${playsRes.error.message}`,
          };
        }
        playRows = (bare.data ?? []) as PlayRow[];
      } else {
        playRows = (lean.data ?? []) as PlayRow[];
      }
    } else {
      playRows = (playsRes.data ?? []) as PlayRow[];
    }

    const totalByTrack = new Map<string, number>();
    const monthByTrack = new Map<string, number>();
    const listeners = new Set<string>();
    let playsThisMonth = 0;

    for (const p of playRows) {
      const tid = p.track_id as string;
      // Self-listens don't count as streams / earnings signals
      if (p.listener_id && p.listener_id === artistId) continue;
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
    const recentListeners = await loadRecentSharedListeners(
      db,
      playRows,
      rows,
    );

    return {
      tracks,
      totalPlays,
      playsThisMonth,
      uniqueListeners: listeners.size,
      followerCount: followers.count,
      publishedCount,
      draftCount,
      topTracks,
      recentListeners,
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

/**
 * Named recent listeners who opted into privacy_show_activity.
 * Opted-out listeners stay in uniqueListeners counts only.
 */
async function loadRecentSharedListeners(
  db: SupabaseClient,
  playRows: {
    id?: string | number | null;
    track_id: string;
    listener_id?: string | null;
    created_at?: string | null;
  }[],
  tracks: TrackRow[],
): Promise<ArtistRecentListener[]> {
  const titleById = new Map(
    tracks.map((t) => [
      t.id,
      typeof t.title === "string" && t.title.trim() ? t.title.trim() : "Track",
    ]),
  );

  const withListener = playRows
    .filter((p) => p.listener_id)
    .sort((a, b) =>
      (b.created_at || "").localeCompare(a.created_at || ""),
    );

  if (withListener.length === 0) return [];

  const listenerIds = [
    ...new Set(withListener.map((p) => p.listener_id as string)),
  ];

  const { data: users, error } = await db
    .from("users")
    .select("id, display_name, privacy_show_activity")
    .in("id", listenerIds);

  if (error || !users) return [];

  const shareById = new Map<string, { name: string; share: boolean }>();
  for (const u of users) {
    const share = u.privacy_show_activity !== false;
    const name =
      typeof u.display_name === "string" && u.display_name.trim()
        ? u.display_name.trim()
        : "Listener";
    shareById.set(u.id as string, { name, share });
  }

  const out: ArtistRecentListener[] = [];
  const seen = new Set<string>();

  for (const p of withListener) {
    const lid = p.listener_id as string;
    const meta = shareById.get(lid);
    if (!meta?.share) continue;
    // One row per listener (most recent track)
    if (seen.has(lid)) continue;
    seen.add(lid);
    out.push({
      listener_id: lid,
      display_name: meta.name,
      track_id: p.track_id,
      track_title: titleById.get(p.track_id) ?? "Track",
      play_id: p.id != null ? String(p.id) : null,
      played_at: p.created_at ?? null,
    });
    if (out.length >= 12) break;
  }

  return out;
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
