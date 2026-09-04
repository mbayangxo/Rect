import Link from "next/link";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { LiveNowStrip } from "@/components/live-now-strip";
import { RectLogo } from "@/components/rect-logo";
import { TrackCover } from "@/components/track-cover";
import { loadListenerTasteWithBehavior } from "@/lib/dashboard/behavior";
import {
  loadTrendingLiveRoomsNearby,
  loadTrendingPortals,
  loadTrendingTracks,
} from "@/lib/dashboard/trending";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { createClient } from "@/lib/supabase/server";
import type { LiveRoom } from "@/lib/dashboard/live-rooms";

export const dynamic = "force-dynamic";

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
  const city = null;

  const [tracksRes, portalsRes, roomsRes] = await Promise.all([
    loadTrendingTracks(supabase, 16),
    loadTrendingPortals(supabase, 10),
    loadTrendingLiveRoomsNearby(
      supabase,
      { country, city, neighborhood: null },
      12,
    ),
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

      <div className="mx-auto w-full max-w-5xl space-y-12 px-5 py-10 sm:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Home · Discover
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight">
            Discover
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/45">
            Trending songs, worlds, and live rooms. Music plays only when you
            press play.
          </p>
        </div>

        <LiveNowStrip rooms={liveRooms} />

        {(country || city) && roomsRes.rooms.length > 0 ? (
          <p className="text-xs text-white/35">
            Showing Live Rooms
            {city ? ` in ${city}` : ""}
            {country ? ` · ${country}` : ""}. Empty filters fall back to global
            live.
          </p>
        ) : null}

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
            Trending songs
          </h2>
          {tracksRes.error ? (
            <p className="mt-3 text-sm text-[#F5A623]">{tracksRes.error}</p>
          ) : tracksRes.tracks.length === 0 ? (
            <p className="mt-3 text-sm text-white/40">No trending songs yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {tracksRes.tracks.map((t, i) => (
                <li key={t.track_id}>
                  <Link
                    href={`/songs/${t.track_id}`}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 hover:border-[#1DB954]/40"
                  >
                    <span className="w-6 text-center text-xs tabular-nums text-white/35">
                      {i + 1}
                    </span>
                    <TrackCover
                      track={{
                        title: t.title,
                        cover_art_url: t.cover_art_url,
                      }}
                      size="md"
                      href={`/songs/${t.track_id}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {t.title}
                      </span>
                      <span className="block truncate text-xs text-white/40">
                        {t.artist_name} · {t.play_count.toLocaleString()} plays
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
            Trending portals
          </h2>
          <p className="mt-1 text-xs text-white/35">
            Deeper into the art — remixes, worlds, project extras.
          </p>
          {portalsRes.error ? (
            <p className="mt-3 text-sm text-[#F5A623]">{portalsRes.error}</p>
          ) : portalsRes.portals.length === 0 ? (
            <p className="mt-3 text-sm text-white/40">
              No published portals yet. Artists create them in Studio → Portal.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {portalsRes.portals.map((p) => (
                <li key={p.release_id}>
                  <Link
                    href={`/artists/${p.artist_id}/world/${p.release_id}`}
                    className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:border-[#1DB954]/40"
                  >
                    <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
                      {p.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.cover_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {p.title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-white/40">
                        {p.artist_name} · {p.kind}
                        {p.media_count
                          ? ` · ${p.media_count} media`
                          : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <AppBottomNav />
    </main>
  );
}
