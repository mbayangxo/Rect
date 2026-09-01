import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  inTimeWindow,
  parseAnalyticsRange,
  type AnalyticsTimeWindow,
} from "@/lib/dashboard/analytics-time";
import { trackTitle, type TrackRow } from "@/lib/tracks";

export type FanTrackStat = {
  trackId: string;
  title: string;
  plays: number;
  likes: number;
};

export type FanPurchaseRow = {
  kind: "merch" | "download" | "ticket" | "fan_club" | "tip";
  title: string;
  amountXof: number;
  at: string;
  status: string;
};

export type StudioFanProfile = {
  fanId: string;
  displayName: string;
  city: string | null;
  country: string | null;
  isFollower: boolean;
  followsSince: string | null;
  plays: number;
  likes: number;
  tipsXof: number;
  spendXof: number;
  favoriteTracks: FanTrackStat[];
  purchases: FanPurchaseRow[];
  window: AnalyticsTimeWindow;
  error: string | null;
};

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|schema cache|column .* does not exist/i.test(
    message,
  );
}

/**
 * Deep fan profile for Studio analytics — artist CRM view of one listener.
 */
export async function loadStudioFanProfile(
  supabase: SupabaseClient,
  artistId: string,
  fanId: string,
  opts?: { range?: string | null; from?: string | null; to?: string | null },
): Promise<StudioFanProfile> {
  const window = parseAnalyticsRange(opts?.range, opts?.from, opts?.to);
  const empty: StudioFanProfile = {
    fanId,
    displayName: "Fan",
    city: null,
    country: null,
    isFollower: false,
    followsSince: null,
    plays: 0,
    likes: 0,
    tipsXof: 0,
    spendXof: 0,
    favoriteTracks: [],
    purchases: [],
    window,
    error: null,
  };

  if (!fanId || fanId === artistId) {
    return { ...empty, error: "Invalid fan." };
  }

  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;

    const { data: tracksRaw, error: tracksErr } = await db
      .from("tracks")
      .select("id, title, artist_id")
      .eq("artist_id", artistId)
      .limit(500);

    if (tracksErr) {
      return { ...empty, error: tracksErr.message };
    }

    const tracks = (tracksRaw ?? []) as Pick<TrackRow, "id" | "title">[];
    const trackIds = tracks.map((t) => t.id);
    const titleById = new Map(
      tracks.map((t) => [t.id, trackTitle(t as TrackRow)]),
    );

    const { data: userRow } = await db
      .from("users")
      .select("id, display_name, city, countries")
      .eq("id", fanId)
      .maybeSingle();

    const displayName =
      typeof userRow?.display_name === "string" && userRow.display_name.trim()
        ? userRow.display_name.trim()
        : "Fan";
    const city =
      typeof userRow?.city === "string" && userRow.city.trim()
        ? userRow.city.trim()
        : null;
    let country: string | null = null;
    const countries = userRow?.countries;
    if (Array.isArray(countries) && countries.length > 0) {
      country = String(countries[0]);
    } else if (typeof countries === "string" && countries.trim()) {
      country = countries.trim();
    }

    const { data: followRow } = await db
      .from("artist_follows")
      .select("created_at")
      .eq("artist_id", artistId)
      .eq("follower_id", fanId)
      .maybeSingle();

    const playCountByTrack = new Map<string, number>();
    let plays = 0;
    if (trackIds.length > 0) {
      const { data: playRows, error: playErr } = await db
        .from("plays")
        .select("track_id, created_at")
        .eq("listener_id", fanId)
        .in("track_id", trackIds)
        .limit(5000);

      if (playErr && !isMissingRelation(playErr.message)) {
        return { ...empty, displayName, city, country, error: playErr.message };
      }

      for (const p of playRows ?? []) {
        if (!inTimeWindow(p.created_at as string, window)) continue;
        const tid = p.track_id as string;
        plays += 1;
        playCountByTrack.set(tid, (playCountByTrack.get(tid) ?? 0) + 1);
      }
    }

    const likeCountByTrack = new Map<string, number>();
    let likes = 0;
    if (trackIds.length > 0) {
      const { data: likeRows } = await db
        .from("track_likes")
        .select("track_id, created_at")
        .eq("user_id", fanId)
        .in("track_id", trackIds)
        .limit(2000);
      for (const row of likeRows ?? []) {
        if (!inTimeWindow(row.created_at as string, window)) continue;
        likes += 1;
        const tid = row.track_id as string;
        likeCountByTrack.set(tid, (likeCountByTrack.get(tid) ?? 0) + 1);
      }
    }

    const favoriteTracks: FanTrackStat[] = [...playCountByTrack.entries()]
      .map(([trackId, playCount]) => ({
        trackId,
        title: titleById.get(trackId) ?? "Track",
        plays: playCount,
        likes: likeCountByTrack.get(trackId) ?? 0,
      }))
      .sort(
        (a, b) =>
          b.plays * 10 +
          b.likes * 5 -
          (a.plays * 10 + a.likes * 5),
      )
      .slice(0, 8);

    // Also surface liked-but-unplayed tracks
    for (const [trackId, likeCount] of likeCountByTrack) {
      if (playCountByTrack.has(trackId)) continue;
      favoriteTracks.push({
        trackId,
        title: titleById.get(trackId) ?? "Track",
        plays: 0,
        likes: likeCount,
      });
    }
    favoriteTracks.sort(
      (a, b) => b.plays * 10 + b.likes * 5 - (a.plays * 10 + a.likes * 5),
    );
    if (favoriteTracks.length > 8) favoriteTracks.length = 8;

    const purchases: FanPurchaseRow[] = [];
    let tipsXof = 0;
    let spendXof = 0;

    const { data: tipRows } = await db
      .from("artist_tips")
      .select("amount_xof, created_at, status, track_id")
      .eq("artist_id", artistId)
      .eq("from_user_id", fanId)
      .limit(100);
    for (const tip of tipRows ?? []) {
      if (!inTimeWindow(tip.created_at as string, window)) continue;
      const amt = Number(tip.amount_xof) || 0;
      tipsXof += amt;
      spendXof += amt;
      purchases.push({
        kind: "tip",
        title: tip.track_id
          ? `Tip · ${titleById.get(tip.track_id as string) ?? "track"}`
          : "Tip",
        amountXof: amt,
        at: String(tip.created_at ?? ""),
        status: String(tip.status ?? "ok"),
      });
    }

    const { data: merchRows } = await db
      .from("merch_purchases")
      .select("price_xof, created_at, status, merch_item_id")
      .eq("artist_id", artistId)
      .eq("buyer_id", fanId)
      .eq("status", "confirmed")
      .limit(100);
    const merchIds = [
      ...new Set(
        (merchRows ?? [])
          .map((r) => r.merch_item_id as number | null)
          .filter((id): id is number => id != null),
      ),
    ];
    const merchTitle = new Map<number, string>();
    if (merchIds.length > 0) {
      const { data: items } = await db
        .from("artist_merch_items")
        .select("id, title")
        .in("id", merchIds);
      for (const it of items ?? []) {
        merchTitle.set(Number(it.id), String(it.title ?? "Merch"));
      }
    }
    for (const row of merchRows ?? []) {
      if (!inTimeWindow(row.created_at as string, window)) continue;
      const amt = Number(row.price_xof) || 0;
      spendXof += amt;
      purchases.push({
        kind: "merch",
        title: merchTitle.get(Number(row.merch_item_id)) ?? "Merch",
        amountXof: amt,
        at: String(row.created_at ?? ""),
        status: String(row.status ?? "confirmed"),
      });
    }

    const { data: dlRows } = await db
      .from("track_download_purchases")
      .select("price_xof, created_at, status, track_id")
      .eq("artist_id", artistId)
      .eq("buyer_id", fanId)
      .eq("status", "confirmed")
      .limit(100);
    for (const row of dlRows ?? []) {
      if (!inTimeWindow(row.created_at as string, window)) continue;
      const amt = Number(row.price_xof) || 0;
      spendXof += amt;
      purchases.push({
        kind: "download",
        title: `Download · ${titleById.get(row.track_id as string) ?? "track"}`,
        amountXof: amt,
        at: String(row.created_at ?? ""),
        status: String(row.status ?? "confirmed"),
      });
    }

    const { data: ticketRows } = await db
      .from("tour_ticket_purchases")
      .select("price_xof, created_at, status, event_id, quantity")
      .eq("artist_id", artistId)
      .eq("buyer_id", fanId)
      .eq("status", "confirmed")
      .limit(100);
    const eventIds = [
      ...new Set(
        (ticketRows ?? [])
          .map((r) => r.event_id as number | null)
          .filter((id): id is number => id != null),
      ),
    ];
    const eventTitle = new Map<number, string>();
    if (eventIds.length > 0) {
      const { data: events } = await db
        .from("artist_tour_events")
        .select("id, title, city")
        .in("id", eventIds);
      for (const ev of events ?? []) {
        eventTitle.set(
          Number(ev.id),
          `${ev.title ?? "Show"}${ev.city ? ` · ${ev.city}` : ""}`,
        );
      }
    }
    for (const row of ticketRows ?? []) {
      if (!inTimeWindow(row.created_at as string, window)) continue;
      const amt = Number(row.price_xof) || 0;
      spendXof += amt;
      const qty = Number(row.quantity) || 1;
      purchases.push({
        kind: "ticket",
        title: `${eventTitle.get(Number(row.event_id)) ?? "Ticket"} ×${qty}`,
        amountXof: amt,
        at: String(row.created_at ?? ""),
        status: String(row.status ?? "confirmed"),
      });
    }

    const { data: fcRows } = await db
      .from("fan_club_members")
      .select("price_xof, created_at, started_at, status, tier_id")
      .eq("artist_id", artistId)
      .eq("fan_id", fanId)
      .limit(20);
    const tierIds = [
      ...new Set(
        (fcRows ?? [])
          .map((r) => r.tier_id as number | null)
          .filter((id): id is number => id != null),
      ),
    ];
    const tierName = new Map<number, string>();
    if (tierIds.length > 0) {
      const { data: tiers } = await db
        .from("fan_club_tiers")
        .select("id, name")
        .in("id", tierIds);
      for (const t of tiers ?? []) {
        tierName.set(Number(t.id), String(t.name ?? "Fan club"));
      }
    }
    for (const row of fcRows ?? []) {
      const at =
        (typeof row.started_at === "string" && row.started_at) ||
        (row.created_at as string);
      if (!inTimeWindow(at, window)) continue;
      if (row.status !== "active") continue;
      const amt = Number(row.price_xof) || 0;
      spendXof += amt;
      purchases.push({
        kind: "fan_club",
        title: tierName.get(Number(row.tier_id)) ?? "Fan club",
        amountXof: amt,
        at: String(at ?? ""),
        status: "active",
      });
    }

    purchases.sort((a, b) => (b.at || "").localeCompare(a.at || ""));

    return {
      fanId,
      displayName,
      city,
      country,
      isFollower: Boolean(followRow),
      followsSince:
        typeof followRow?.created_at === "string" ? followRow.created_at : null,
      plays,
      likes,
      tipsXof,
      spendXof,
      favoriteTracks,
      purchases: purchases.slice(0, 40),
      window,
      error: null,
    };
  } catch (e) {
    return {
      ...empty,
      error: e instanceof Error ? e.message : "Failed to load fan profile",
    };
  }
}
