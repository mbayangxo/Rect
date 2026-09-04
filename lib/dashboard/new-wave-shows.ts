import type { SupabaseClient } from "@supabase/supabase-js";
import { loadListenerTasteWithBehavior } from "@/lib/dashboard/behavior";
import { loadRadioStations, type RadioStation } from "@/lib/dashboard/radio";
import { tasteFromProfile } from "@/lib/dashboard/taste";

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
 * New Wave — new / featured radio stations on Wave (not music launches).
 * Music launches live under New Sounds. Live rooms stay on Home / Artist.
 */
export async function loadNewWaveShows(
  supabase: SupabaseClient,
  userId?: string | null,
  limit = 16,
): Promise<{ shows: NewWaveShow[]; error: string | null }> {
  let taste = tasteFromProfile(null);
  if (userId) {
    taste = await loadListenerTasteWithBehavior(supabase, userId, null);
  }

  const stationsRes = await loadRadioStations(supabase, taste);
  const stations = stationsRes.stations.filter((s) => s.tracks.length > 0);
  // Prefer non–Your Wave stations as “new shows”, then fill with flagship.
  const ordered = [
    ...stations.filter((s) => !s.forYou),
    ...stations.filter((s) => s.forYou),
  ];

  const shows: NewWaveShow[] = [];
  for (const s of ordered) {
    if (shows.length >= limit) break;
    shows.push(stationToShow(s));
  }

  return {
    shows,
    error: stationsRes.error,
  };
}
