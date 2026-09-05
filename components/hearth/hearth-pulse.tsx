"use client";

import Link from "next/link";
import { usePlayer } from "@/components/player-provider";
import type { HearingAidEpisode } from "@/lib/dashboard/hearing-aids";
import type { LivePresenceItem } from "@/lib/dashboard/live-presence";
import type { NewSoundsTrack } from "@/lib/dashboard/new-sounds";
import type { NewWaveShow } from "@/lib/dashboard/new-wave-shows";
import type { TrendingPortal, TrendingTrack } from "@/lib/dashboard/trending";
import type { RankedTrack } from "@/lib/dashboard/tracks";
import { trackTitle } from "@/lib/tracks";

type Props = {
  livePresence: LivePresenceItem[];
  trendingTracks: TrendingTrack[];
  trendingPortals: TrendingPortal[];
  featured: RankedTrack[];
  /** New Wave — trending radio shows on Wave. */
  newWaveShows?: NewWaveShow[];
  /** New Sounds — trending music launches. */
  newSoundsTracks?: NewSoundsTrack[];
  /** Hearing Aids — trending podcast / talk. */
  hearingAids?: HearingAidEpisode[];
};

/**
 * Home “Trending” pulse — all sonic products that are hot right now:
 * Live Rooms & RECT Live · New Wave · New Sounds · tracks · Hearing Aids · Worlds.
 * Full rails live on Discover.
 */
export function HearthPulse({
  livePresence,
  trendingTracks,
  trendingPortals,
  featured,
  newWaveShows = [],
  newSoundsTracks = [],
  hearingAids = [],
}: Props) {
  const player = usePlayer();

  const featuredById = new Map(featured.map((t) => [t.id, t]));
  const newSoundsById = new Map(newSoundsTracks.map((t) => [t.id, t]));

  function playTrending(t: TrendingTrack) {
    const full =
      featuredById.get(t.track_id) || newSoundsById.get(t.track_id);
    if (full?.audio_url) {
      player.play(full);
    }
  }

  const hasPulse =
    livePresence.length > 0 ||
    newWaveShows.length > 0 ||
    newSoundsTracks.length > 0 ||
    trendingTracks.length > 0 ||
    hearingAids.length > 0 ||
    trendingPortals.length > 0;

  if (!hasPulse) return null;

  return (
    <section className="hearth-pulse" aria-label="What's happening">
      <div className="hearth-zone-head">
        <div>
          <p className="hearth-zone-kicker">Sonically trending</p>
          <h2 className="hearth-zone-title">Trending</h2>
        </div>
        <Link href="/discover" className="hearth-zone-link">
          Full discover →
        </Link>
      </div>

      {livePresence.length > 0 ? (
        <div className="hearth-pulse-block">
          <div className="hearth-pulse-label-row">
            <p className="hearth-pulse-label">
              <span className="hearth-live-dot" aria-hidden />
              Live Rooms & RECT Live
            </p>
            <Link href="/discover" className="hearth-pulse-more">
              See all →
            </Link>
          </div>
          <ul className="hearth-live-rail">
            {livePresence.slice(0, 10).map((r) => (
              <li key={r.id}>
                <Link href={r.href} className="hearth-live-card">
                  <span className="hearth-live-avatar">
                    {r.artist_avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.artist_avatar} alt="" />
                    ) : (
                      <span>{(r.artist_name || "A")[0]}</span>
                    )}
                  </span>
                  <span className="hearth-live-name">{r.artist_name}</span>
                  <span className="hearth-live-title">{r.title}</span>
                  <span className="hearth-live-meta">
                    {r.kind === "rect_live" ? "RECT Live" : r.modeLabel} ·{" "}
                    {r.viewer_count} in
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {newWaveShows.length > 0 ? (
        <div className="hearth-pulse-block">
          <div className="hearth-pulse-label-row">
            <p className="hearth-pulse-label">New Wave</p>
            <Link href="/new-wave" className="hearth-pulse-more">
              All shows →
            </Link>
          </div>
          <ul className="hearth-live-rail">
            {newWaveShows.slice(0, 8).map((s) => (
              <li key={s.id}>
                <Link href={s.href} className="hearth-live-card">
                  <span
                    className="hearth-live-avatar"
                    style={
                      s.cover_url
                        ? {
                            backgroundImage: `url(${s.cover_url})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }
                        : undefined
                    }
                  >
                    {!s.cover_url ? <span>⌁</span> : null}
                  </span>
                  <span className="hearth-live-name">{s.title}</span>
                  <span className="hearth-live-title">{s.subtitle}</span>
                  <span className="hearth-live-meta">{s.meta}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {newSoundsTracks.length > 0 ? (
        <div className="hearth-pulse-block">
          <div className="hearth-pulse-label-row">
            <p className="hearth-pulse-label">New Sounds</p>
            <Link href="/new-sounds" className="hearth-pulse-more">
              Full mix →
            </Link>
          </div>
          <ul className="hearth-trend-rail">
            {newSoundsTracks.slice(0, 8).map((t, i) => (
              <li key={t.id}>
                <article className="hearth-trend-card">
                  <span className="hearth-trend-rank">{i + 1}</span>
                  <button
                    type="button"
                    className="hearth-trend-art"
                    style={
                      t.cover_art_url
                        ? { backgroundImage: `url(${t.cover_art_url})` }
                        : undefined
                    }
                    onClick={() => {
                      const list = newSoundsTracks.filter((x) => x.audio_url);
                      const idx = list.findIndex((x) => x.id === t.id);
                      if (list.length === 0) return;
                      player.playQueue(list, idx >= 0 ? idx : 0);
                    }}
                    aria-label={`Play ${trackTitle(t)}`}
                  >
                    <span className="hearth-trend-play">▶</span>
                  </button>
                  <div className="hearth-trend-copy">
                    <Link href={`/songs/${t.id}`} className="hearth-trend-title">
                      {trackTitle(t)}
                    </Link>
                    <p className="hearth-trend-artist">
                      {t.artist_name || "Artist"}
                    </p>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {trendingTracks.length > 0 ? (
        <div className="hearth-pulse-block">
          <div className="hearth-pulse-label-row">
            <p className="hearth-pulse-label">On the rise</p>
            <Link href="/discover" className="hearth-pulse-more">
              Discover →
            </Link>
          </div>
          <ul className="hearth-trend-rail">
            {trendingTracks.slice(0, 8).map((t, i) => (
              <li key={t.track_id}>
                <article className="hearth-trend-card">
                  <span className="hearth-trend-rank">{i + 1}</span>
                  <button
                    type="button"
                    className="hearth-trend-art"
                    style={
                      t.cover_art_url
                        ? { backgroundImage: `url(${t.cover_art_url})` }
                        : undefined
                    }
                    onClick={() => playTrending(t)}
                    aria-label={`Play ${t.title}`}
                  >
                    <span className="hearth-trend-play">▶</span>
                  </button>
                  <div className="hearth-trend-copy">
                    <Link
                      href={`/songs/${t.track_id}`}
                      className="hearth-trend-title"
                    >
                      {t.title}
                    </Link>
                    <p className="hearth-trend-artist">{t.artist_name}</p>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hearingAids.length > 0 ? (
        <div className="hearth-pulse-block">
          <div className="hearth-pulse-label-row">
            <p className="hearth-pulse-label">Hearing Aids</p>
            <Link href="/hearing-aids" className="hearth-pulse-more">
              Episodes →
            </Link>
          </div>
          <ul className="hearth-trend-rail">
            {hearingAids.slice(0, 6).map((t, i) => (
              <li key={t.id}>
                <article className="hearth-trend-card">
                  <span className="hearth-trend-rank">{i + 1}</span>
                  <button
                    type="button"
                    className="hearth-trend-art"
                    style={
                      t.cover_art_url
                        ? { backgroundImage: `url(${t.cover_art_url})` }
                        : undefined
                    }
                    onClick={() => {
                      const list = hearingAids.filter((x) => x.audio_url);
                      const idx = list.findIndex((x) => x.id === t.id);
                      if (list.length === 0) return;
                      player.playQueue(list, idx >= 0 ? idx : 0);
                    }}
                    aria-label={`Play ${trackTitle(t)}`}
                  >
                    <span className="hearth-trend-play">▶</span>
                  </button>
                  <div className="hearth-trend-copy">
                    <Link href={`/songs/${t.id}`} className="hearth-trend-title">
                      {trackTitle(t)}
                    </Link>
                    <p className="hearth-trend-artist">
                      {t.artist_name || "Host"}
                    </p>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {trendingPortals.length > 0 ? (
        <div className="hearth-pulse-block">
          <p className="hearth-pulse-label">Worlds opening</p>
          <ul className="hearth-portal-rail">
            {trendingPortals.slice(0, 6).map((p) => (
              <li key={p.release_id}>
                <Link
                  href={`/artists/${p.artist_id}/world/${p.release_id}`}
                  className="hearth-portal-card"
                >
                  <div
                    className="hearth-portal-art"
                    style={
                      p.cover_url
                        ? { backgroundImage: `url(${p.cover_url})` }
                        : undefined
                    }
                  />
                  <span className="hearth-portal-kind">{p.kind}</span>
                  <span className="hearth-portal-title">{p.title}</span>
                  <span className="hearth-portal-artist">{p.artist_name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
