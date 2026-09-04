"use client";

import Link from "next/link";
import { HomeShelf, type ShelfTrack } from "@/components/hearth/home-shelf";
import { HomeShowShelf } from "@/components/hearth/home-show-shelf";
import { usePlayer } from "@/components/player-provider";
import type { FanMixItem } from "@/lib/dashboard/fan-mixes";
import type { HearingAidEpisode } from "@/lib/dashboard/hearing-aids";
import type { NewWaveShow } from "@/lib/dashboard/new-wave-shows";
import type { NewSoundsTrack } from "@/lib/dashboard/new-sounds";
import type { FriendsMixItem } from "@/lib/dashboard/people-follows";
import type { PopularTourEvent } from "@/lib/dashboard/tour-events";
import type { RankedTrack } from "@/lib/dashboard/tracks";
import type { TrackRow } from "@/lib/tracks";

export type DiscoverPortal = {
  release_id: string;
  artist_id: string;
  title: string;
  kind: string;
  artist_name: string | null;
};

type Props = {
  cityLabel: string | null;
  newSounds: NewSoundsTrack[];
  newWaveShows: NewWaveShow[];
  yourWaveShows: NewWaveShow[];
  moodShows: NewWaveShow[];
  cityTracks: RankedTrack[];
  alkebulanTracks: RankedTrack[];
  fanMixes: FanMixItem[];
  friendsMixes: FriendsMixItem[];
  hearingAids: HearingAidEpisode[];
  tourEvents: PopularTourEvent[];
  portals: DiscoverPortal[];
};

function toShelfTracks(
  tracks: (TrackRow & { artist_name?: string | null })[],
): ShelfTrack[] {
  return tracks.map((t) => ({
    ...t,
    subtitle: t.artist_name ?? null,
  }));
}

function playList(
  player: ReturnType<typeof usePlayer>,
  tracks: TrackRow[],
  track: TrackRow,
  index: number,
) {
  const list = tracks.filter((x) => x.audio_url);
  const idx = list.findIndex((x) => x.id === track.id);
  player.playQueue(list, idx >= 0 ? idx : index);
}

function MixRail({
  kicker,
  title,
  seeAllHref,
  seeAllLabel,
  items,
}: {
  kicker: string;
  title: string;
  seeAllHref?: string;
  seeAllLabel?: string;
  items: {
    id: string;
    name: string;
    href: string;
    cover_art_url: string | null;
    meta: string;
  }[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="home-shelf" aria-label={title}>
      <div className="home-shelf-head">
        <div>
          <p className="home-shelf-kicker">{kicker}</p>
          <h2 className="home-shelf-title">{title}</h2>
        </div>
        {seeAllHref ? (
          <Link href={seeAllHref} className="home-shelf-more">
            {seeAllLabel ?? "See all →"}
          </Link>
        ) : null}
      </div>
      <ul className="home-shelf-rail">
        {items.map((m) => (
          <li key={m.id} className="home-shelf-item">
            <Link href={m.href} className="home-shelf-card">
              <span
                className="home-shelf-art"
                style={
                  m.cover_art_url
                    ? { backgroundImage: `url(${m.cover_art_url})` }
                    : undefined
                }
              >
                <span className="home-shelf-play">♫</span>
              </span>
              <span className="home-shelf-copy">
                <span className="home-shelf-name">{m.name}</span>
                <span className="home-shelf-sub">{m.meta}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DiscoverBody({
  cityLabel,
  newSounds,
  newWaveShows,
  yourWaveShows,
  moodShows,
  cityTracks,
  alkebulanTracks,
  fanMixes,
  friendsMixes,
  hearingAids,
  tourEvents,
  portals,
}: Props) {
  const player = usePlayer();

  return (
    <div className="home-shelves space-y-10" aria-label="Discover shelves">
      {newWaveShows.length > 0 ? (
        <HomeShowShelf
          kicker="On Wave"
          title="New Wave"
          seeAllHref="/new-wave"
          seeAllLabel="All shows →"
          shows={newWaveShows}
        />
      ) : null}

      {newSounds.length > 0 ? (
        <HomeShelf
          kicker="Just dropped"
          title="New Sounds"
          seeAllHref="/new-sounds"
          seeAllLabel="Full mix →"
          tracks={toShelfTracks(newSounds)}
          onPlay={(track, index) =>
            playList(player, newSounds, track, index)
          }
        />
      ) : null}

      {cityTracks.length > 0 ? (
        <HomeShelf
          kicker="Near you"
          title={
            cityLabel
              ? `Popular in ${cityLabel}`
              : "Popular in your city"
          }
          seeAllHref="/charts"
          seeAllLabel="STANDINGS →"
          tracks={toShelfTracks(cityTracks)}
          onPlay={(track, index) =>
            playList(player, cityTracks, track, index)
          }
        />
      ) : null}

      {alkebulanTracks.length > 0 ? (
        <HomeShelf
          kicker="Continental"
          title="THE ALKEBULAN"
          seeAllHref="/charts"
          seeAllLabel="Full board →"
          tracks={toShelfTracks(alkebulanTracks)}
          onPlay={(track, index) =>
            playList(player, alkebulanTracks, track, index)
          }
        />
      ) : null}

      {yourWaveShows.length > 0 ? (
        <HomeShowShelf
          kicker="Tuned to you"
          title="Your Wave"
          seeAllHref="/radio"
          seeAllLabel="Open Wave →"
          shows={yourWaveShows}
        />
      ) : null}

      {moodShows.length > 0 ? (
        <HomeShowShelf
          kicker="By energy"
          title="Mood mixes"
          seeAllHref="/radio"
          seeAllLabel="Wave stations →"
          shows={moodShows}
        />
      ) : null}

      <MixRail
        kicker="From the culture"
        title="Fan mixes"
        seeAllHref="/search"
        seeAllLabel="Browse →"
        items={fanMixes.map((m) => ({
          id: m.id,
          name: m.name,
          href: `/playlists/${m.id}`,
          cover_art_url: m.cover_art_url,
          meta:
            m.save_count > 0
              ? `${m.owner_name} · ${m.save_count} saves`
              : `${m.owner_name} · ${m.track_count} tracks`,
        }))}
      />

      <MixRail
        kicker="People you follow"
        title="Friends mixes"
        seeAllHref="/following"
        seeAllLabel="Following →"
        items={friendsMixes.map((m) => ({
          id: m.id,
          name: m.name,
          href: `/playlists/${m.id}`,
          cover_art_url: m.cover_art_url,
          meta: m.owner_name,
        }))}
      />

      {hearingAids.length > 0 ? (
        <HomeShelf
          kicker="Talk · podcasts"
          title="Hearing Aids"
          seeAllHref="/hearing-aids"
          seeAllLabel="All episodes →"
          tracks={toShelfTracks(hearingAids)}
          onPlay={(track, index) =>
            playList(player, hearingAids, track, index)
          }
        />
      ) : null}

      {tourEvents.length > 0 ? (
        <section className="home-shelf" aria-label="Tour events">
          <div className="home-shelf-head">
            <div>
              <p className="home-shelf-kicker">On the road</p>
              <h2 className="home-shelf-title">Popular upcoming shows</h2>
            </div>
          </div>
          <ul className="home-shelf-rail">
            {tourEvents.map((e) => (
              <li key={e.id} className="home-shelf-item">
                <Link
                  href={`/artists/${e.artist_id}`}
                  className="home-shelf-card"
                >
                  <span
                    className="home-shelf-art"
                    style={
                      e.cover_url
                        ? { backgroundImage: `url(${e.cover_url})` }
                        : e.artist_avatar
                          ? { backgroundImage: `url(${e.artist_avatar})` }
                          : undefined
                    }
                  >
                    <span className="home-shelf-play">◉</span>
                  </span>
                  <span className="home-shelf-copy">
                    <span className="home-shelf-name">{e.title}</span>
                    <span className="home-shelf-sub">
                      {[e.artist_name, e.city]
                        .filter(Boolean)
                        .join(" · ")}
                      {e.tickets_sold > 0
                        ? ` · ${e.tickets_sold} tickets`
                        : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {portals.length > 0 ? (
        <section className="home-shelf" aria-label="Worlds opening">
          <div className="home-shelf-head">
            <div>
              <p className="home-shelf-kicker">Portals</p>
              <h2 className="home-shelf-title">Worlds opening</h2>
            </div>
          </div>
          <ul className="home-shelf-rail">
            {portals.map((p) => (
              <li key={p.release_id} className="home-shelf-item">
                <Link
                  href={`/artists/${p.artist_id}/world/${p.release_id}`}
                  className="home-shelf-card"
                >
                  <span className="home-shelf-art">
                    <span className="home-shelf-play">◇</span>
                  </span>
                  <span className="home-shelf-copy">
                    <span className="home-shelf-name">{p.title}</span>
                    <span className="home-shelf-sub">
                      {p.kind}
                      {p.artist_name ? ` · ${p.artist_name}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-xs text-white/35">
        Your mixes live in{" "}
        <Link href="/playlists" className="text-[#1DB954] hover:underline">
          Your mixes
        </Link>
        . Friends mixes are public playlists from people you follow. Fan mixes
        are the public ones trending on Discover. Mood mixes are Wave daypart
        stations (Morning · Afternoon · Evening · Late Night). Africa chart is{" "}
        <span className="text-white/55">THE ALKEBULAN</span>. Podcasts are{" "}
        <Link href="/hearing-aids" className="text-[#1DB954] hover:underline">
          Hearing Aids
        </Link>
        .
      </p>
    </div>
  );
}
