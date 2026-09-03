import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPublicLiveNow } from "@/lib/dashboard/live-rooms";
import { loadRadioStations, type RadioStation } from "@/lib/dashboard/radio";
import { loadListenerTaste, tasteFromProfile } from "@/lib/dashboard/taste";

export type NewWaveShow = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  cover_url: string | null;
  kind: "station" | "live";
  meta: string;
};

function stationToShow(s: RadioStation): NewWaveShow {
  const cover =
    s.tracks.find((t) => t.cover_art_url)?.cover_art_url ?? null;
  const bits = [s.genre, s.place, s.language, s.daypart].filter(Boolean);
  return {
    id: `station:${s.id}`,
    title: s.label,
    subtitle: s.subtitle || bits.slice(0, 2).join(" · ") || "Wave station",
    href: `/radio?station=${encodeURIComponent(s.id)}`,
    cover_url: cover,
    kind: "station",
    meta: s.forYou
      ? "For you"
      : `${s.tracks.length} track${s.tracks.length === 1 ? "" : "s"}`,
  };
}

/**
 * New Wave — new / featured radio shows on Wave (not music launches).
 * Music launches live under New Sounds.
 */
export async function loadNewWaveShows(
  supabase: SupabaseClient,
  userId?: string | null,
  limit = 16,
): Promise<{ shows: NewWaveShow[]; error: string | null }> {
  let taste = tasteFromProfile(null);
  if (userId) {
    taste = await loadListenerTaste(supabase, userId, null);
  }

  const [stationsRes, liveRes] = await Promise.all([
    loadRadioStations(supabase, taste),
    loadPublicLiveNow(supabase, 8),
  ]);

  const shows: NewWaveShow[] = [];

  for (const room of liveRes.rooms) {
    shows.push({
      id: `live:${room.id}`,
      title: room.title,
      subtitle: room.artist_name || "Live on Wave",
      href: `/artists/${room.artist_id}/live/${room.id}`,
      cover_url: room.stage_photo_url || room.artist_avatar || null,
      kind: "live",
      meta: `${room.mode} · ${room.viewer_count} listening`,
    });
  }

  const stations = stationsRes.stations.filter((s) => s.tracks.length > 0);
  // Prefer non–Your Wave stations as “new shows”, then fill with flagship.
  const ordered = [
    ...stations.filter((s) => !s.forYou),
    ...stations.filter((s) => s.forYou),
  ];
  for (const s of ordered) {
    if (shows.length >= limit) break;
    shows.push(stationToShow(s));
  }

  return {
    shows: shows.slice(0, limit),
    error: stationsRes.error,
  };
}
