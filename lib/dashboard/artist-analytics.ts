import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadArtistPlayEarnings, PLAY_EARNING_XOF } from "@/lib/dashboard/play-earnings";
import { loadArtistStudioStats } from "@/lib/dashboard/artist-stats";
import { trackTitle } from "@/lib/tracks";

export type PlaysByDay = {
  date: string;
  label: string;
  count: number;
};

export type ArtistAnalyticsDashboard = {
  totalPlays: number;
  playsThisWeek: number;
  playsToday: number;
  topSongTitle: string | null;
  topSongPlays: number;
  followerCount: number;
  playCreditsEarnedXof: number;
  creditedPlayCount: number;
  playsByDay: PlaysByDay[];
  followsReady: boolean;
  error: string | null;
};

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function formatDayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export async function loadArtistAnalyticsDashboard(
  supabase: SupabaseClient,
  artistId: string,
): Promise<ArtistAnalyticsDashboard> {
  const empty: ArtistAnalyticsDashboard = {
    totalPlays: 0,
    playsThisWeek: 0,
    playsToday: 0,
    topSongTitle: null,
    topSongPlays: 0,
    followerCount: 0,
    playCreditsEarnedXof: 0,
    creditedPlayCount: 0,
    playsByDay: [],
    followsReady: true,
    error: null,
  };

  try {
    const [stats, earnings] = await Promise.all([
      loadArtistStudioStats(supabase, artistId),
      loadArtistPlayEarnings(supabase, artistId),
    ]);

    if (stats.error) {
      return { ...empty, error: stats.error };
    }

    const sorted = [...stats.tracks].sort((a, b) => b.play_count - a.play_count);
    const top = stats.topTracks[0] ?? sorted[0];
    const topSongTitle = top ? trackTitle(top) : null;
    const topSongPlays = top?.play_count ?? 0;

    const admin = createAdminClient();
    const db = admin ?? supabase;
    const trackIds = stats.tracks.map((t) => t.id);

    const now = new Date();
    const todayStart = startOfUtcDay(now).toISOString();
    const weekStart = new Date(startOfUtcDay(now));
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const weekStartIso = weekStart.toISOString();

    const dayKeys: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(startOfUtcDay(now));
      d.setUTCDate(d.getUTCDate() - i);
      dayKeys.push(dayKey(d.toISOString()));
    }

    const countsByDay = new Map<string, number>();
    for (const k of dayKeys) countsByDay.set(k, 0);

    let playsToday = 0;
    let playsThisWeek = 0;

    if (trackIds.length > 0) {
      const { data: playRows, error: playErr } = await db
        .from("plays")
        .select("track_id, listener_id, created_at")
        .in("track_id", trackIds)
        .gte("created_at", weekStartIso);

      if (!playErr && playRows) {
        for (const p of playRows) {
          if (p.listener_id === artistId) continue;
          const at = p.created_at as string | null;
          if (!at) continue;
          if (at >= todayStart) playsToday += 1;
          playsThisWeek += 1;
          const k = dayKey(at);
          if (countsByDay.has(k)) {
            countsByDay.set(k, (countsByDay.get(k) ?? 0) + 1);
          }
        }
      }
    }

    const playsByDay: PlaysByDay[] = dayKeys.map((date) => ({
      date,
      label: formatDayLabel(date),
      count: countsByDay.get(date) ?? 0,
    }));

    const playCreditsEarnedXof = earnings.missingTable
      ? stats.totalPlays * PLAY_EARNING_XOF
      : earnings.totalXof;

    return {
      totalPlays: stats.totalPlays,
      playsThisWeek,
      playsToday,
      topSongTitle,
      topSongPlays,
      followerCount: stats.followerCount,
      playCreditsEarnedXof,
      creditedPlayCount: earnings.playCount,
      playsByDay,
      followsReady: stats.followsReady,
      error: earnings.error,
    };
  } catch (e) {
    return {
      ...empty,
      error: e instanceof Error ? e.message : "Failed to load analytics",
    };
  }
}
