"use client";

import Link from "next/link";
import { usePlayer } from "@/components/player-provider";
import type { LiveRoom } from "@/lib/dashboard/live-rooms";
import type { TrendingPortal, TrendingTrack } from "@/lib/dashboard/trending";
import type { RankedTrack } from "@/lib/dashboard/tracks";

type Props = {
  rooms: LiveRoom[];
  trendingTracks: TrendingTrack[];
  trendingPortals: TrendingPortal[];
  featured: RankedTrack[];
};

export function HearthPulse({
  rooms,
  trendingTracks,
  trendingPortals,
  featured,
}: Props) {
  const player = usePlayer();

  const featuredById = new Map(featured.map((t) => [t.id, t]));

  function playTrending(t: TrendingTrack) {
    const full = featuredById.get(t.track_id);
    if (full?.audio_url) {
      player.play(full);
      return;
    }
  }

  const hasPulse =
    rooms.length > 0 ||
    trendingTracks.length > 0 ||
    trendingPortals.length > 0;

  if (!hasPulse) return null;

  return (
    <section className="hearth-pulse" aria-label="What's happening">
      <div className="hearth-zone-head">
        <div>
          <p className="hearth-zone-kicker">Right now</p>
          <h2 className="hearth-zone-title">The pulse</h2>
        </div>
        <Link href="/discover" className="hearth-zone-link">
          Full discover →
        </Link>
      </div>

      {rooms.length > 0 ? (
        <div className="hearth-pulse-block">
          <p className="hearth-pulse-label">
            <span className="hearth-live-dot" aria-hidden />
            Live rooms
          </p>
          <ul className="hearth-live-rail">
            {rooms.slice(0, 8).map((r) => (
              <li key={r.id}>
                <Link
                  href={`/artists/${r.artist_id}/live/${r.id}`}
                  className="hearth-live-card"
                >
                  <span className="hearth-live-avatar">
                    {r.artist_avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.artist_avatar} alt="" />
                    ) : (
                      <span>{(r.artist_name || "A")[0]}</span>
                    )}
                  </span>
                  <span className="hearth-live-name">
                    {r.artist_name || "Artist"}
                  </span>
                  <span className="hearth-live-title">{r.title}</span>
                  <span className="hearth-live-meta">
                    {r.mode} · {r.viewer_count} in
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {trendingTracks.length > 0 ? (
        <div className="hearth-pulse-block">
          <p className="hearth-pulse-label">On the rise</p>
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
