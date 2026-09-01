import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dayKey,
  formatDayLabel,
  formatWeekLabel,
  inTimeWindow,
  parseAnalyticsRange,
  weekStartKey,
  type AnalyticsRangeId,
  type AnalyticsTimeWindow,
} from "@/lib/dashboard/analytics-time";
import { countFanClubMembers, loadFanClubGrowth } from "@/lib/dashboard/fan-club";
import { loadLikeCountMap } from "@/lib/dashboard/likes";
import { countTrackDownloadSales } from "@/lib/dashboard/track-downloads-paid";
import { loadArtistPlayEarnings } from "@/lib/dashboard/play-earnings";
import { loadCityDemandForArtist } from "@/lib/dashboard/tour-demand";
import {
  loadArtistChartPositions,
  type ArtistChartPosition,
} from "@/lib/dashboard/standings";
import { tipsTableReady } from "@/lib/dashboard/tips";
import { listDistributionReleases } from "@/lib/dashboard/distribution";
import { isTaaliLive } from "@/lib/taali/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoTrack, isPublishedTrack, trackTitle, type TrackRow } from "@/lib/tracks";

export type PlaysByDay = {
  date: string;
  label: string;
  count: number;
};

export type PlaysByWeek = {
  weekStart: string;
  label: string;
  count: number;
};

export type SongPerformanceRow = {
  trackId: string;
  title: string;
  coverArtUrl: string | null;
  status: string | null;
  totalStreams: number;
  streamsInRange: number;
  streamsThisWeek: number;
  streamsToday: number;
  chartPosition: number | null;
  chartBoard: string | null;
  revenueXof: number;
  downloadSales: number;
  completionRate: number | null;
  skipRate: null;
  likes: number;
  saves: number;
  shares: number;
  comments: number;
  publishedAt: string | null;
};

export type StudioAnalytics = {
  window: AnalyticsTimeWindow;
  overview: {
    totalStreamsAllTime: number;
    streamsInRange: number;
    streamsToday: number;
    streamsThisWeek: number;
    totalRevenueXof: number;
    revenueInRangeXof: number;
    totalSalesCount: number;
    salesInRange: number;
    followers: number;
    fanClubMembers: number;
    fanClubReady: boolean;
    followsReady: boolean;
  };
  songs: SongPerformanceRow[];
  audience: {
    countries: { name: string; count: number; pct: number }[];
    cities: { name: string; count: number }[];
    neighborhoods: { name: string; count: number }[];
    languages: { name: string; count: number; pct: number }[];
    tourDemand: { city: string; place: string | null; requestCount: number; uniqueFans: number }[];
    followerCities: { name: string; count: number }[];
    devices: {
      mobile: number;
      desktop: number;
      unknown: number;
      tracked: boolean;
    };
    newListeners: number;
    returningListeners: number;
    uniqueListenersInRange: number;
  };
  revenue: {
    streamsXof: number;
    streamsInRangeXof: number;
    downloadsXof: number;
    merchXof: number;
    merchInRangeXof: number;
    fanClubXof: number;
    tipsXof: number;
    tipsInRangeXof: number;
    ticketsXof: number;
    ticketsInRangeXof: number;
    monthTotalXof: number;
    allTimeXof: number;
    payouts: { date: string; amountXof: number; reference: string; status: string }[];
    merchReady: boolean;
    tipsReady: boolean;
    earningsReady: boolean;
  };
  chartPositions: ArtistChartPosition[];
  chartMilestones: {
    trackId: string;
    trackTitle: string;
    firstLightAt: string | null;
    onCityChart: boolean;
    onRegionalChart: boolean;
    onNeighborhoodChart: boolean;
    highestPosition: number | null;
    highestBoard: string | null;
  }[];
  playsTrend: PlaysByDay[];
  weeklyTrend: PlaysByWeek[];
  engagement: {
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    topFans: {
      listenerId: string;
      displayName: string;
      plays: number;
      likes: number;
      tipsXof: number;
      score: number;
    }[];
    fanClubGrowth: PlaysByDay[];
    followerGrowth: PlaysByDay[];
  };
  delivery: {
    ready: boolean;
    taaliLive: boolean;
    total: number;
    byStatus: Record<string, number>;
    liveCount: number;
    releases: {
      id: string;
      title: string;
      status: string;
      smartLinkSlug: string | null;
      releaseDate: string | null;
    }[];
  };
  errors: string[];
};

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|schema cache/i.test(
    message,
  );
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

type PlayRow = {
  id?: string | number | null;
  track_id: string;
  listener_id?: string | null;
  created_at?: string | null;
  listened_secs?: number | null;
};

function completionRatesByTrack(
  playRows: PlayRow[],
  trackById: Map<string, TrackRow>,
): Map<string, number> {
  const acc = new Map<
    string,
    { listenedTotal: number; playCount: number; duration: number }
  >();

  for (const p of playRows) {
    const secs = p.listened_secs;
    if (secs == null || secs <= 0) continue;
    const track = trackById.get(p.track_id);
    const duration =
      typeof track?.duration_secs === "number" && track.duration_secs > 0
        ? track.duration_secs
        : null;
    if (!duration) continue;

    const cur = acc.get(p.track_id) ?? {
      listenedTotal: 0,
      playCount: 0,
      duration,
    };
    cur.listenedTotal += Math.min(secs, duration);
    cur.playCount += 1;
    acc.set(p.track_id, cur);
  }

  const out = new Map<string, number>();
  for (const [trackId, s] of acc) {
    if (s.playCount <= 0) continue;
    out.set(
      trackId,
      Math.round((s.listenedTotal / (s.playCount * s.duration)) * 100),
    );
  }
  return out;
}

function emptyAnalytics(window: AnalyticsTimeWindow): StudioAnalytics {
  return {
    window,
    overview: {
      totalStreamsAllTime: 0,
      streamsInRange: 0,
      streamsToday: 0,
      streamsThisWeek: 0,
      totalRevenueXof: 0,
      revenueInRangeXof: 0,
      totalSalesCount: 0,
      salesInRange: 0,
      followers: 0,
      fanClubMembers: 0,
      fanClubReady: false,
      followsReady: true,
    },
    songs: [],
    audience: {
      countries: [],
      cities: [],
      neighborhoods: [],
      languages: [],
      tourDemand: [],
      followerCities: [],
      devices: { mobile: 0, desktop: 0, unknown: 0, tracked: false },
      newListeners: 0,
      returningListeners: 0,
      uniqueListenersInRange: 0,
    },
    revenue: {
      streamsXof: 0,
      streamsInRangeXof: 0,
      downloadsXof: 0,
      merchXof: 0,
      merchInRangeXof: 0,
      fanClubXof: 0,
      tipsXof: 0,
      tipsInRangeXof: 0,
      ticketsXof: 0,
      ticketsInRangeXof: 0,
      monthTotalXof: 0,
      allTimeXof: 0,
      payouts: [],
      merchReady: false,
      tipsReady: false,
      earningsReady: true,
    },
    chartPositions: [],
    chartMilestones: [],
    playsTrend: [],
    weeklyTrend: [],
    engagement: {
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
      topFans: [],
      fanClubGrowth: [],
      followerGrowth: [],
    },
    delivery: {
      ready: false,
      taaliLive: false,
      total: 0,
      byStatus: {},
      liveCount: 0,
      releases: [],
    },
    errors: [],
  };
}

export async function loadStudioAnalytics(
  supabase: SupabaseClient,
  artistId: string,
  options?: {
    range?: AnalyticsRangeId | string | null;
    from?: string | null;
    to?: string | null;
  },
): Promise<StudioAnalytics> {
  const window = parseAnalyticsRange(
    options?.range ?? "week",
    options?.from,
    options?.to,
  );
  const base = emptyAnalytics(window);
  const errors: string[] = [];

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

    if (trackError) {
      return {
        ...base,
        errors: [trackError.message],
      };
    }

    const tracks = ((trackData ?? []) as TrackRow[]).filter((t) => !isDemoTrack(t));
    const trackIds = tracks.map((t) => t.id);
    const trackById = new Map(tracks.map((t) => [t.id, t]));

    const now = new Date();
    const todayStart = startOfUtcDay(now).toISOString();
    const weekStart = new Date(startOfUtcDay(now));
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const weekStartIso = weekStart.toISOString();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString();

    let playRows: PlayRow[] = [];
    let listenedSecsReady = true;
    if (trackIds.length > 0) {
      const playsRes = await db
        .from("plays")
        .select("id, track_id, listener_id, created_at, listened_secs")
        .in("track_id", trackIds);

      if (playsRes.error) {
        listenedSecsReady = /listened_secs|column .* does not exist/i.test(
          playsRes.error.message,
        )
          ? false
          : listenedSecsReady;
        const lean = await db
          .from("plays")
          .select("track_id, listener_id, created_at")
          .in("track_id", trackIds);
        if (lean.error) errors.push(`Plays: ${lean.error.message}`);
        else playRows = (lean.data ?? []) as PlayRow[];
      } else {
        playRows = (playsRes.data ?? []) as PlayRow[];
      }
    }

    const validPlays = playRows.filter(
      (p) => p.listener_id && p.listener_id !== artistId,
    );

    const totalByTrack = new Map<string, number>();
    const rangeByTrack = new Map<string, number>();
    const todayByTrack = new Map<string, number>();
    const weekByTrack = new Map<string, number>();
    let totalStreamsAllTime = 0;
    let streamsInRange = 0;
    let streamsToday = 0;
    let streamsThisWeek = 0;

    const listenerFirstPlay = new Map<string, string>();
    const listenersInRange = new Set<string>();

    for (const p of validPlays) {
      const tid = p.track_id;
      const at = p.created_at ?? "";
      totalByTrack.set(tid, (totalByTrack.get(tid) ?? 0) + 1);
      totalStreamsAllTime += 1;

      if (at >= todayStart) {
        streamsToday += 1;
        todayByTrack.set(tid, (todayByTrack.get(tid) ?? 0) + 1);
      }
      if (at >= weekStartIso) {
        streamsThisWeek += 1;
        weekByTrack.set(tid, (weekByTrack.get(tid) ?? 0) + 1);
      }

      if (inTimeWindow(at, window)) {
        streamsInRange += 1;
        rangeByTrack.set(tid, (rangeByTrack.get(tid) ?? 0) + 1);
        if (p.listener_id) listenersInRange.add(p.listener_id);
      }

      if (p.listener_id) {
        const prev = listenerFirstPlay.get(p.listener_id);
        if (!prev || at < prev) listenerFirstPlay.set(p.listener_id, at);
      }
    }

    let newListeners = 0;
    let returningListeners = 0;
    for (const lid of listenersInRange) {
      const first = listenerFirstPlay.get(lid);
      if (!first) continue;
      if (first >= (window.from ?? "")) newListeners += 1;
      else returningListeners += 1;
    }

    const trendDays: string[] = [];
    const trendFrom =
      window.id === "all"
        ? (() => {
            const d = new Date(startOfUtcDay(now));
            d.setUTCDate(d.getUTCDate() - 29);
            return d;
          })()
        : window.from
          ? new Date(window.from)
          : weekStart;

    const trendStart = startOfUtcDay(trendFrom);
    for (
      let d = new Date(trendStart);
      d <= now;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      trendDays.push(dayKey(d.toISOString()));
      if (trendDays.length > 90) break;
    }

    const countsByDay = new Map<string, number>();
    for (const k of trendDays) countsByDay.set(k, 0);
    for (const p of validPlays) {
      const at = p.created_at;
      if (!at) continue;
      const k = dayKey(at);
      if (countsByDay.has(k)) {
        countsByDay.set(k, (countsByDay.get(k) ?? 0) + 1);
      }
    }

    const playsTrend: PlaysByDay[] = trendDays.map((date) => ({
      date,
      label: formatDayLabel(date),
      count: countsByDay.get(date) ?? 0,
    }));

    const weekBuckets = new Map<string, number>();
    const weeksBack = 12;
    const firstWeekStart = new Date(startOfUtcDay(now));
    firstWeekStart.setUTCDate(firstWeekStart.getUTCDate() - weeksBack * 7);
    for (let w = 0; w <= weeksBack; w++) {
      const d = new Date(firstWeekStart);
      d.setUTCDate(d.getUTCDate() + w * 7);
      weekBuckets.set(weekStartKey(d.toISOString()), 0);
    }
    for (const p of validPlays) {
      const at = p.created_at;
      if (!at) continue;
      const wk = weekStartKey(at);
      if (weekBuckets.has(wk)) {
        weekBuckets.set(wk, (weekBuckets.get(wk) ?? 0) + 1);
      }
    }
    const weeklyTrend: PlaysByWeek[] = [...weekBuckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, count]) => ({
        weekStart,
        label: formatWeekLabel(weekStart),
        count,
      }));

    const completionByTrack = listenedSecsReady
      ? completionRatesByTrack(validPlays, trackById)
      : new Map<string, number>();

    const [earnings, chartRes, followersRes, tipsReady, likesMap] =
      await Promise.all([
        loadArtistPlayEarnings(supabase, artistId),
        loadArtistChartPositions(supabase, artistId),
        db
          .from("artist_follows")
          .select("follower_id", { count: "exact", head: true })
          .eq("artist_id", artistId),
        tipsTableReady(supabase),
        trackIds.length > 0
          ? loadLikeCountMap(db, trackIds)
          : Promise.resolve(new Map<string, number>()),
      ]);

    const earningsByTrack = new Map<string, number>();
    if (!earnings.missingTable) {
      const { data: earnRows } = await db
        .from("artist_play_earnings")
        .select("track_id, amount_xof, created_at")
        .eq("artist_id", artistId)
        .limit(5000);

      for (const row of earnRows ?? []) {
        const tid = row.track_id as string | null;
        if (!tid) continue;
        earningsByTrack.set(tid, (earningsByTrack.get(tid) ?? 0) + Number(row.amount_xof) || 0);
      }
    }

    const commentsByTrack = new Map<string, number>();
    if (trackIds.length > 0) {
      const { data: comments, error: cErr } = await db
        .from("track_comments")
        .select("track_id")
        .in("track_id", trackIds);
      if (cErr && !isMissingRelation(cErr.message)) errors.push(`Comments: ${cErr.message}`);
      for (const c of comments ?? []) {
        const tid = c.track_id as string;
        commentsByTrack.set(tid, (commentsByTrack.get(tid) ?? 0) + 1);
      }
    }

    const downloadSalesByTrack = await countTrackDownloadSales(db, artistId, trackIds);

    const sharesByTrack = new Map<string, number>();
    if (trackIds.length > 0) {
      const { data: shares, error: sErr } = await db
        .from("artist_notifications")
        .select("track_id")
        .eq("kind", "track_share")
        .in("track_id", trackIds);
      if (sErr && !isMissingRelation(sErr.message)) errors.push(`Shares: ${sErr.message}`);
      for (const s of shares ?? []) {
        const tid = s.track_id as string;
        if (!tid) continue;
        sharesByTrack.set(tid, (sharesByTrack.get(tid) ?? 0) + 1);
      }
    }

    const savesByTrack = new Map<string, number>();
    if (trackIds.length > 0) {
      const { data: saves, error: saveErr } = await db
        .from("playlist_tracks")
        .select("track_id")
        .in("track_id", trackIds);
      if (saveErr && !isMissingRelation(saveErr.message)) {
        errors.push(`Saves: ${saveErr.message}`);
      }
      for (const row of saves ?? []) {
        const tid = row.track_id as string;
        if (!tid) continue;
        savesByTrack.set(tid, (savesByTrack.get(tid) ?? 0) + 1);
      }
    }

    let tipsXof = 0;
    let tipsInRangeXof = 0;
    if (tipsReady) {
      const { data: tips, error: tErr } = await db
        .from("artist_tips")
        .select("amount_xof, created_at")
        .eq("artist_id", artistId);
      if (tErr) errors.push(`Tips: ${tErr.message}`);
      for (const tip of tips ?? []) {
        const amt = Number(tip.amount_xof) || 0;
        tipsXof += amt;
        if (inTimeWindow(tip.created_at as string, window)) tipsInRangeXof += amt;
      }
    }

    let merchXof = 0;
    let merchInRangeXof = 0;
    let merchSalesTotal = 0;
    let merchSalesInRange = 0;
    let merchReady = false;

    const merchRes = await db
      .from("merch_purchases")
      .select("price_xof, created_at, status")
      .eq("artist_id", artistId)
      .eq("status", "confirmed");

    if (!merchRes.error) {
      merchReady = true;
      for (const row of merchRes.data ?? []) {
        const amt = Number(row.price_xof) || 0;
        merchXof += amt;
        merchSalesTotal += 1;
        if (inTimeWindow(row.created_at as string, window)) {
          merchInRangeXof += amt;
          merchSalesInRange += 1;
        }
      }
    } else if (!isMissingRelation(merchRes.error.message)) {
      errors.push(`Merch: ${merchRes.error.message}`);
    }

    const bestChartByTrack = new Map<
      string,
      { position: number; board: string }
    >();
    for (const cp of chartRes.positions) {
      const prev = bestChartByTrack.get(cp.trackId);
      if (!prev || cp.position < prev.position) {
        bestChartByTrack.set(cp.trackId, {
          position: cp.position,
          board: cp.boardTitle,
        });
      }
    }

    const songs: SongPerformanceRow[] = tracks.map((t) => {
      const chart = bestChartByTrack.get(t.id);
      return {
        trackId: t.id,
        title: trackTitle(t),
        coverArtUrl:
          typeof t.cover_art_url === "string" ? t.cover_art_url : null,
        status: typeof t.status === "string" ? t.status : null,
        totalStreams: totalByTrack.get(t.id) ?? 0,
        streamsInRange: rangeByTrack.get(t.id) ?? 0,
        streamsThisWeek: weekByTrack.get(t.id) ?? 0,
        streamsToday: todayByTrack.get(t.id) ?? 0,
        chartPosition: chart?.position ?? null,
        chartBoard: chart?.board ?? null,
        revenueXof: earningsByTrack.get(t.id) ?? 0,
        downloadSales: downloadSalesByTrack.get(t.id) ?? 0,
        completionRate: completionByTrack.get(t.id) ?? null,
        skipRate: null,
        likes: likesMap.get(t.id) ?? 0,
        saves: savesByTrack.get(t.id) ?? 0,
        shares: sharesByTrack.get(t.id) ?? 0,
        comments: commentsByTrack.get(t.id) ?? 0,
        publishedAt: t.created_at ?? null,
      };
    });

    songs.sort((a, b) => b.streamsInRange - a.streamsInRange);

    const listenerIds = [...listenersInRange];
    const countryCounts = new Map<string, number>();
    const cityCounts = new Map<string, number>();
    const langCounts = new Map<string, number>();

    if (listenerIds.length > 0) {
      const { data: users } = await db
        .from("users")
        .select("id, countries, city, genres")
        .in("id", listenerIds);

      for (const u of users ?? []) {
        const countries = Array.isArray(u.countries)
          ? u.countries.filter((c): c is string => typeof c === "string")
          : [];
        for (const c of countries.length ? countries : ["Unknown"]) {
          countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1);
        }
        const city =
          typeof u.city === "string" && u.city.trim() ? u.city.trim() : null;
        if (city) cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);
      }

      for (const t of tracks) {
        if (!t.language) continue;
        const streams = rangeByTrack.get(t.id) ?? 0;
        if (streams <= 0) continue;
        langCounts.set(
          t.language,
          (langCounts.get(t.language) ?? 0) + streams,
        );
      }
    }

    const countryTotal = [...countryCounts.values()].reduce((a, b) => a + b, 0);
    const langTotal = [...langCounts.values()].reduce((a, b) => a + b, 0);

    const countries = [...countryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        name,
        count,
        pct: countryTotal ? Math.round((count / countryTotal) * 100) : 0,
      }));

    const cities = [...cityCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, count]) => ({ name, count }));

    const dakarNeighborhoods = [...cityCounts.entries()]
      .filter(([name]) =>
        /dakar|almadies|plateau|medina|pikine|guediawaye|ouakam|mermoz|fann|yoff/i.test(
          name,
        ),
      )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    const languages = [...langCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        name,
        count,
        pct: langTotal ? Math.round((count / langTotal) * 100) : 0,
      }));

    const fanScores = new Map<
      string,
      { plays: number; likes: number; tipsXof: number }
    >();
    for (const p of validPlays) {
      if (!p.listener_id || !inTimeWindow(p.created_at, window)) continue;
      const cur = fanScores.get(p.listener_id) ?? {
        plays: 0,
        likes: 0,
        tipsXof: 0,
      };
      cur.plays += 1;
      fanScores.set(p.listener_id, cur);
    }

    if (tipsReady) {
      const { data: tipRows } = await db
        .from("artist_tips")
        .select("from_user_id, amount_xof, created_at")
        .eq("artist_id", artistId);
      for (const tip of tipRows ?? []) {
        const uid = tip.from_user_id as string;
        if (!inTimeWindow(tip.created_at as string, window)) continue;
        const cur = fanScores.get(uid) ?? { plays: 0, likes: 0, tipsXof: 0 };
        cur.tipsXof += Number(tip.amount_xof) || 0;
        fanScores.set(uid, cur);
      }
    }

    if (trackIds.length > 0) {
      const { data: likeRows } = await db
        .from("track_likes")
        .select("user_id, track_id, created_at")
        .in("track_id", trackIds)
        .limit(5000);
      for (const row of likeRows ?? []) {
        const uid = row.user_id as string | null;
        if (!uid || uid === artistId) continue;
        if (!inTimeWindow(row.created_at as string, window)) continue;
        const cur = fanScores.get(uid) ?? { plays: 0, likes: 0, tipsXof: 0 };
        cur.likes += 1;
        fanScores.set(uid, cur);
      }
    }

    const topFanIds = [...fanScores.entries()]
      .sort(
        (a, b) =>
          b[1].plays * 10 +
          b[1].likes * 5 +
          b[1].tipsXof / 100 -
          (a[1].plays * 10 + a[1].likes * 5 + a[1].tipsXof / 100),
      )
      .slice(0, 8)
      .map(([id]) => id);

    const nameById = new Map<string, string>();
    if (topFanIds.length > 0) {
      const { data: fanUsers } = await db
        .from("users")
        .select("id, display_name")
        .in("id", topFanIds);
      for (const u of fanUsers ?? []) {
        nameById.set(
          u.id as string,
          typeof u.display_name === "string" && u.display_name.trim()
            ? u.display_name.trim()
            : "Fan",
        );
      }
    }

    const topFans = topFanIds.map((listenerId) => {
      const s = fanScores.get(listenerId)!;
      return {
        listenerId,
        displayName: nameById.get(listenerId) ?? "Fan",
        plays: s.plays,
        likes: s.likes,
        tipsXof: s.tipsXof,
        score: s.plays * 10 + s.likes * 5 + Math.round(s.tipsXof / 50),
      };
    });

    const chartMilestones = tracks
      .filter((t) => isPublishedTrack(t))
      .map((t) => {
        const positions = chartRes.positions.filter((p) => p.trackId === t.id);
        const best = positions.sort((a, b) => a.position - b.position)[0];
        return {
          trackId: t.id,
          trackTitle: trackTitle(t),
          firstLightAt: t.created_at ?? null,
          onNeighborhoodChart: positions.some((p) => p.boardId === "neighborhood"),
          onCityChart: positions.some((p) =>
            p.boardId.startsWith("city"),
          ),
          onRegionalChart: positions.some((p) => p.boardId === "alkebulan"),
          highestPosition: best?.position ?? null,
          highestBoard: best?.boardTitle ?? null,
        };
      });

    const streamsXof = earnings.missingTable ? 0 : earnings.totalXof;

    let streamsInRangeXof = 0;
    if (!earnings.missingTable) {
      const { data: earnRows } = await db
        .from("artist_play_earnings")
        .select("amount_xof, created_at")
        .eq("artist_id", artistId);
      for (const row of earnRows ?? []) {
        if (inTimeWindow(row.created_at as string, window)) {
          streamsInRangeXof += Number(row.amount_xof) || 0;
        }
      }
    }

    const allTimeXof = streamsXof + tipsXof + merchXof;
    const revenueInRangeXof =
      streamsInRangeXof + tipsInRangeXof + merchInRangeXof;

    let monthTotalXof = 0;
    if (!earnings.missingTable) monthTotalXof += earnings.thisMonthXof;

    const { data: monthTips } = tipsReady
      ? await db
          .from("artist_tips")
          .select("amount_xof")
          .eq("artist_id", artistId)
          .gte("created_at", monthStart)
      : { data: [] };
    monthTotalXof += (monthTips ?? []).reduce(
      (s, t) => s + (Number(t.amount_xof) || 0),
      0,
    );
    if (merchReady) {
      monthTotalXof += (merchRes.data ?? [])
        .filter((r) => (r.created_at as string) >= monthStart)
        .reduce((s, r) => s + (Number(r.price_xof) || 0), 0);
    }

    const followsReady = !followersRes.error || !isMissingRelation(followersRes.error.message);
    if (followersRes.error && !isMissingRelation(followersRes.error.message)) {
      errors.push(`Followers: ${followersRes.error.message}`);
    }

    const fanClubMembers = await countFanClubMembers(db, artistId);
    const tierProbe = await db
      .from("fan_club_tiers")
      .select("id")
      .eq("artist_id", artistId)
      .limit(1);
    const fanClubReady =
      !tierProbe.error || !isMissingRelation(tierProbe.error.message);

    let downloadsXof = 0;
    let downloadsInRangeXof = 0;
    let downloadSalesTotal = 0;
    let downloadSalesInRange = 0;
    const { data: dlPurchases } = await db
      .from("track_download_purchases")
      .select("price_xof, created_at, track_id")
      .eq("artist_id", artistId)
      .eq("status", "confirmed");
    if (dlPurchases) {
      for (const row of dlPurchases) {
        const amt = Number(row.price_xof) || 0;
        downloadsXof += amt;
        downloadSalesTotal += 1;
        if (inTimeWindow(row.created_at as string, window)) {
          downloadsInRangeXof += amt;
          downloadSalesInRange += 1;
        }
      }
    }

    let fanClubXof = 0;
    let fanClubInRangeXof = 0;
    const { data: fcMembers } = await db
      .from("fan_club_members")
      .select("price_xof, created_at, started_at")
      .eq("artist_id", artistId)
      .eq("status", "active");
    for (const row of fcMembers ?? []) {
      const amt = Number(row.price_xof) || 0;
      fanClubXof += amt;
      const at =
        (typeof row.started_at === "string" && row.started_at) ||
        (row.created_at as string);
      if (inTimeWindow(at, window)) fanClubInRangeXof += amt;
    }

    const fanClubGrowthRaw = await loadFanClubGrowth(db, artistId);
    const fanClubGrowth: PlaysByDay[] = fanClubGrowthRaw.map((d) => ({
      date: d.date,
      label: formatDayLabel(d.date),
      count: d.count,
    }));

    const followerGrowth: PlaysByDay[] = [];
    const { data: followRows } = await db
      .from("artist_follows")
      .select("created_at")
      .eq("artist_id", artistId)
      .order("created_at", { ascending: true });
    const followByDay = new Map<string, number>();
    for (const row of followRows ?? []) {
      const at = row.created_at as string | null;
      if (!at) continue;
      const k = dayKey(at);
      followByDay.set(k, (followByDay.get(k) ?? 0) + 1);
    }
    for (const [date, count] of [...followByDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      followerGrowth.push({ date, label: formatDayLabel(date), count });
    }

    let ticketsXof = 0;
    let ticketsInRangeXof = 0;
    let ticketSalesTotal = 0;
    let ticketSalesInRange = 0;
    const { data: ticketRows, error: ticketErr } = await db
      .from("tour_ticket_purchases")
      .select("price_xof, created_at, quantity")
      .eq("artist_id", artistId)
      .eq("status", "confirmed");
    if (!ticketErr && ticketRows) {
      for (const row of ticketRows) {
        const amt = Number(row.price_xof) || 0;
        ticketsXof += amt;
        ticketSalesTotal += Number(row.quantity) || 1;
        if (inTimeWindow(row.created_at as string, window)) {
          ticketsInRangeXof += amt;
          ticketSalesInRange += Number(row.quantity) || 1;
        }
      }
    }

    const demandRes = await loadCityDemandForArtist(db, artistId);
    const tourDemand = demandRes.rows.slice(0, 15);

    const followerCities: { name: string; count: number }[] = [];
    const { data: followIds } = await db
      .from("artist_follows")
      .select("follower_id")
      .eq("artist_id", artistId)
      .limit(500);
    const followerIdList = [
      ...new Set(
        (followIds ?? [])
          .map((r) => r.follower_id as string | null)
          .filter(Boolean) as string[],
      ),
    ];
    if (followerIdList.length > 0) {
      const followerCityCounts = new Map<string, number>();
      for (let i = 0; i < followerIdList.length; i += 100) {
        const chunk = followerIdList.slice(i, i + 100);
        const { data: fu } = await db
          .from("users")
          .select("city")
          .in("id", chunk);
        for (const u of fu ?? []) {
          const city =
            typeof u.city === "string" && u.city.trim() ? u.city.trim() : null;
          if (!city) continue;
          followerCityCounts.set(
            city,
            (followerCityCounts.get(city) ?? 0) + 1,
          );
        }
      }
      followerCities.push(
        ...[...followerCityCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([name, count]) => ({ name, count })),
      );
    }

    const payouts: { date: string; amountXof: number; reference: string; status: string }[] = [];
    const { data: payoutRows } = await db
      .from("artist_joko_payouts")
      .select("amount_xof, status, joko_reference, created_at")
      .eq("artist_id", artistId)
      .order("created_at", { ascending: false })
      .limit(20);
    for (const row of payoutRows ?? []) {
      payouts.push({
        date: String(row.created_at ?? ""),
        amountXof: Number(row.amount_xof) || 0,
        reference: String(row.joko_reference ?? ""),
        status: String(row.status ?? ""),
      });
    }

    const allTimeXofFinal =
      streamsXof + tipsXof + merchXof + downloadsXof + fanClubXof + ticketsXof;
    const revenueInRangeFinal =
      streamsInRangeXof +
      tipsInRangeXof +
      merchInRangeXof +
      downloadsInRangeXof +
      fanClubInRangeXof +
      ticketsInRangeXof;

    const deliveryRes = await listDistributionReleases(db, artistId);
    const byStatus: Record<string, number> = {};
    for (const r of deliveryRes.releases) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    }

    return {
      window,
      overview: {
        totalStreamsAllTime,
        streamsInRange,
        streamsToday,
        streamsThisWeek,
        totalRevenueXof: allTimeXofFinal,
        revenueInRangeXof: revenueInRangeFinal,
        totalSalesCount: merchSalesTotal + downloadSalesTotal + ticketSalesTotal,
        salesInRange: merchSalesInRange + downloadSalesInRange + ticketSalesInRange,
        followers: followersRes.count ?? 0,
        fanClubMembers,
        fanClubReady: Boolean(fanClubReady),
        followsReady,
      },
      songs,
      audience: {
        countries,
        cities,
        neighborhoods: dakarNeighborhoods,
        languages,
        tourDemand,
        followerCities,
        devices: { mobile: 0, desktop: 0, unknown: listenersInRange.size, tracked: false },
        newListeners,
        returningListeners,
        uniqueListenersInRange: listenersInRange.size,
      },
      revenue: {
        streamsXof,
        streamsInRangeXof,
        downloadsXof,
        merchXof,
        merchInRangeXof,
        fanClubXof,
        tipsXof,
        tipsInRangeXof,
        ticketsXof,
        ticketsInRangeXof,
        monthTotalXof:
          monthTotalXof +
          (dlPurchases ?? [])
            .filter((r) => (r.created_at as string) >= monthStart)
            .reduce((s, r) => s + (Number(r.price_xof) || 0), 0) +
          (fcMembers ?? [])
            .filter((r) => {
              const started =
                typeof r.started_at === "string" ? r.started_at : null;
              const at = started ?? (r.created_at as string);
              return Boolean(at && at >= monthStart);
            })
            .reduce((s, r) => s + (Number(r.price_xof) || 0), 0) +
          (ticketRows ?? [])
            .filter((r) => (r.created_at as string) >= monthStart)
            .reduce((s, r) => s + (Number(r.price_xof) || 0), 0),
        allTimeXof: allTimeXofFinal,
        payouts,
        merchReady,
        tipsReady,
        earningsReady: !earnings.missingTable,
      },
      chartPositions: chartRes.positions,
      chartMilestones,
      playsTrend,
      weeklyTrend,
      engagement: {
        totalLikes: [...likesMap.values()].reduce((a, b) => a + b, 0),
        totalComments: [...commentsByTrack.values()].reduce((a, b) => a + b, 0),
        totalShares: [...sharesByTrack.values()].reduce((a, b) => a + b, 0),
        topFans,
        fanClubGrowth,
        followerGrowth,
      },
      delivery: {
        ready: !deliveryRes.missingTable,
        taaliLive: deliveryRes.taaliLive || isTaaliLive(),
        total: deliveryRes.releases.length,
        byStatus,
        liveCount: byStatus.live ?? 0,
        releases: deliveryRes.releases.slice(0, 12).map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          smartLinkSlug: r.smart_link_slug,
          releaseDate: r.release_date,
        })),
      },
      errors: [...errors, ...(chartRes.error ? [chartRes.error] : [])],
    };
  } catch (e) {
    return {
      ...base,
      errors: [e instanceof Error ? e.message : "Failed to load analytics"],
    };
  }
}

/** @deprecated use loadStudioAnalytics */
export async function loadArtistAnalyticsDashboard(
  supabase: SupabaseClient,
  artistId: string,
) {
  const data = await loadStudioAnalytics(supabase, artistId, { range: "week" });
  return {
    totalPlays: data.overview.totalStreamsAllTime,
    playsThisWeek: data.overview.streamsThisWeek,
    playsToday: data.overview.streamsToday,
    topSongTitle: data.songs[0]?.title ?? null,
    topSongPlays: data.songs[0]?.totalStreams ?? 0,
    followerCount: data.overview.followers,
    playCreditsEarnedXof: data.revenue.streamsXof,
    creditedPlayCount: data.overview.totalStreamsAllTime,
    playsByDay: data.playsTrend.slice(-7),
    chartPositions: data.chartPositions,
    followsReady: data.overview.followsReady,
    error: data.errors[0] ?? null,
  };
}

export type ArtistAnalyticsDashboard = Awaited<
  ReturnType<typeof loadArtistAnalyticsDashboard>
>;
