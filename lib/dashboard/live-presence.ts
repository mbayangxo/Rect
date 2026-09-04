import type { LiveRoom } from "@/lib/dashboard/live-rooms";

/** Unified live presence card for Home / Discover trending. */
export type LivePresenceItem = {
  id: string;
  kind: "live_room" | "rect_live";
  artist_id: string;
  artist_name: string;
  artist_avatar: string | null;
  title: string;
  href: string;
  viewer_count: number;
  modeLabel: string;
  place: string | null;
};

export function liveRoomToPresence(r: LiveRoom): LivePresenceItem {
  return {
    id: `room:${r.id}`,
    kind: "live_room",
    artist_id: r.artist_id,
    artist_name: r.artist_name || "Artist",
    artist_avatar: r.artist_avatar ?? null,
    title: r.title,
    href: `/artists/${r.artist_id}/live/${r.id}`,
    viewer_count: r.viewer_count,
    modeLabel: r.mode || "live",
    place: [r.neighborhood, r.city, r.country].filter(Boolean).join(" · ") || null,
  };
}

export function rectLiveToPresence(l: {
  id: string;
  artist_id: string;
  title: string;
  viewer_count: number;
  host?: string;
  country?: string | null;
  city?: string | null;
  artist_name?: string | null;
  artist_avatar?: string | null;
}): LivePresenceItem {
  return {
    id: `rect:${l.id}`,
    kind: "rect_live",
    artist_id: l.artist_id,
    artist_name: l.artist_name || "Artist",
    artist_avatar: l.artist_avatar ?? null,
    title: l.title,
    href: `/artists/${l.artist_id}/rect-live/${l.id}`,
    viewer_count: l.viewer_count,
    modeLabel: "RECT Live",
    place: [l.city, l.country].filter(Boolean).join(" · ") || null,
  };
}

/** Merge Live Rooms + RECT Lives, trending by viewers. */
export function mergeTrendingLivePresence(
  rooms: LiveRoom[],
  rectLives: Parameters<typeof rectLiveToPresence>[0][],
  limit = 16,
): LivePresenceItem[] {
  return [
    ...rooms.map(liveRoomToPresence),
    ...rectLives.map(rectLiveToPresence),
  ]
    .sort((a, b) => b.viewer_count - a.viewer_count)
    .slice(0, limit);
}
