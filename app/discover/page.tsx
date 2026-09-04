import Link from "next/link";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { DiscoverBody } from "@/components/discover/discover-body";
import { LiveNowStrip } from "@/components/live-now-strip";
import { RectLogo } from "@/components/rect-logo";
import { loadListenerTasteWithBehavior } from "@/lib/dashboard/behavior";
import { ALKEBULAN_CHART_PLACES, DAKAR_CHART_PLACES } from "@/lib/dashboard/charts";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { loadPopularFanMixes } from "@/lib/dashboard/fan-mixes";
import { loadHearingAidEpisodes } from "@/lib/dashboard/hearing-aids";
import { mergeTrendingLivePresence } from "@/lib/dashboard/live-presence";
import type { LiveRoom } from "@/lib/dashboard/live-rooms";
import { loadNewSoundsTracks } from "@/lib/dashboard/new-sounds";
import { loadNewWaveShows } from "@/lib/dashboard/new-wave-shows";
import { loadFriendsMixes } from "@/lib/dashboard/people-follows";
import { loadPublicRectLivesNow } from "@/lib/dashboard/rect-live";
import { loadRadioStations } from "@/lib/dashboard/radio";
import {
  loadTrendingLiveRoomsNearby,
  loadTrendingPortals,
} from "@/lib/dashboard/trending";
import { loadPopularUpcomingTourEvents } from "@/lib/dashboard/tour-events";
import { loadRankedTracks } from "@/lib/dashboard/tracks";
import type { NewWaveShow } from "@/lib/dashboard/new-wave-shows";
import type { RadioStation } from "@/lib/dashboard/radio";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

export default async function DiscoverPage() {
  const supabase = await createClient();
  const current = await getDashboardCurrentUser(supabase);
  const taste = current.ok
    ? await loadListenerTasteWithBehavior(
        supabase,
        current.user.id,
        current.user.user_metadata as Record<string, unknown> | null,
      )
    : null;
  const country = taste?.countries?.[0] ?? null;
  const cityPlaceKeys =
    country != null
      ? ([country] as readonly string[])
      : DAKAR_CHART_PLACES;
  const cityLabel = country ?? "Dakar";

  const [
    portalsRes,
    roomsRes,
    rectRes,
    newSoundsRes,
    newWaveRes,
    stationsRes,
    cityRes,
    alkebulanRes,
    fanMixesRes,
    friendsMixesRes,
    hearingRes,
    tourRes,
  ] = await Promise.all([
    loadTrendingPortals(supabase, 10),
    loadTrendingLiveRoomsNearby(
      supabase,
      { country, city: null, neighborhood: null },
      12,
    ),
    loadPublicRectLivesNow(supabase, 12),
    loadNewSoundsTracks(supabase, 12),
    loadNewWaveShows(supabase, current.ok ? current.user.id : null, 12),
    loadRadioStations(supabase, taste),
    loadRankedTracks(supabase, 10, taste, { placeKeys: cityPlaceKeys }),
    loadRankedTracks(supabase, 12, taste, {
      placeKeys: ALKEBULAN_CHART_PLACES,
    }),
    loadPopularFanMixes(supabase, 12),
    current.ok
      ? loadFriendsMixes(supabase, current.user.id, 8)
      : Promise.resolve({ items: [], missingTable: false, error: null }),
    loadHearingAidEpisodes(supabase, 10),
    loadPopularUpcomingTourEvents(supabase, 10),
  ]);

  const liveRooms: LiveRoom[] = roomsRes.rooms.map((r) => ({
    id: r.live_room_id,
    artist_id: r.artist_id,
    title: r.title,
    status: "live",
    mode: (r.mode as LiveRoom["mode"]) || "photos",
    visibility: "public",
    host: "world",
    viewer_count: r.viewer_count,
    stage_photo_url: null,
    country: r.country,
    city: r.city,
    neighborhood: r.neighborhood,
    started_at: null,
    ended_at: null,
    created_at: "",
    artist_name: r.artist_name,
    artist_avatar: r.artist_avatar,
  }));

  const livePresence = mergeTrendingLivePresence(
    liveRooms,
    rectRes.lives,
    16,
  );

  const stations = stationsRes.stations.filter((s) => s.tracks.length > 0);
  const yourWaveShows = stations
    .filter((s) => s.forYou && !s.daypart)
    .map(stationToShow)
    .slice(0, 8);
  // Always surface flagship Your Wave / The Wave first when present.
  const flagship = stations.find((s) => s.id === "station-wave");
  const yourWaveOrdered: NewWaveShow[] = [];
  if (flagship) yourWaveOrdered.push(stationToShow(flagship));
  for (const show of yourWaveShows) {
    if (yourWaveOrdered.some((x) => x.id === show.id)) continue;
    yourWaveOrdered.push(show);
  }

  const moodShows = stations
    .filter((s) => Boolean(s.daypart) && s.id !== "station-wave")
    .map(stationToShow)
    .slice(0, 8);

  return (
    <main className="min-h-dvh bg-[#040d06] pb-28 text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/dashboard">
            <RectLogo size={34} showWordmark />
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-white/55 hover:text-white"
          >
            Home
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-10 px-5 py-10 sm:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Home · Discover
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight">
            Discover
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/45">
            Live Rooms & RECT Live, New Wave, New Sounds, your city, THE
            ALKEBULAN, Your Wave, mood mixes, Fan mixes, and Hearing Aids.
          </p>
        </div>

        <LiveNowStrip items={livePresence} />

        {(country || cityLabel) && livePresence.length > 0 ? (
          <p className="text-xs text-white/35">
            Live presence
            {country ? ` · ${country}` : ""}. Empty filters fall back to global
            live.
          </p>
        ) : null}

        <DiscoverBody
          cityLabel={cityLabel}
          newSounds={newSoundsRes.tracks}
          newWaveShows={newWaveRes.shows}
          yourWaveShows={yourWaveOrdered.slice(0, 8)}
          moodShows={moodShows}
          cityTracks={cityRes.ok ? cityRes.tracks : []}
          alkebulanTracks={alkebulanRes.ok ? alkebulanRes.tracks : []}
          fanMixes={fanMixesRes.items}
          friendsMixes={friendsMixesRes.items}
          hearingAids={hearingRes.episodes}
          tourEvents={tourRes.events}
          portals={portalsRes.portals.map((p) => ({
            release_id: p.release_id,
            artist_id: p.artist_id,
            title: p.title,
            kind: p.kind,
            artist_name: p.artist_name,
          }))}
        />
      </div>
      <AppBottomNav />
    </main>
  );
}
