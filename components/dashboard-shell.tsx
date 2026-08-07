"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePlayer } from "@/components/player-provider";
import { SignOutButton } from "@/components/sign-out-button";
import type { ArtistPortal } from "@/lib/dashboard/artists";
import type { PlayPack } from "@/lib/dashboard/play-packs";
import {
  formatPlayCount,
  trackArtist,
  trackTitle,
  type RankedTrack,
} from "@/lib/dashboard/tracks";

type Props = {
  displayName: string;
  featured: RankedTrack[];
  featuredError: string | null;
  artists: ArtistPortal[];
  artistsError: string | null;
  packs: PlayPack[];
};

function formatTime(secs: number) {
  if (!Number.isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

const PORTAL_BG = ["pbg1", "pbg2", "pbg3", "pbg4"] as const;

export function DashboardShell({
  displayName,
  featured,
  featuredError,
  artists,
  artistsError,
  packs,
}: Props) {
  const player = usePlayer();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [liked, setLiked] = useState(false);

  const active = useMemo(() => {
    if (player.track) {
      const match = featured.find((t) => t.id === player.track?.id);
      return match ?? { ...player.track, play_count: 0, artist_name: player.track.artist_name ?? null };
    }
    return featured[0] ?? null;
  }, [player.track, featured]);

  const pct =
    player.duration > 0
      ? Math.min(100, (player.currentTime / player.duration) * 100)
      : 0;

  function playFeatured(track: RankedTrack) {
    if (!track.audio_url) return;
    player.play(track);
  }

  function toggleHero() {
    if (!active?.audio_url) return;
    if (player.track?.id === active.id) {
      player.toggle();
      return;
    }
    player.play(active);
  }

  return (
    <div className="dash-app">
      <div
        className={`dash-ov ${drawerOpen ? "open" : ""}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden={!drawerOpen}
      />
      <aside className={`dash-drawer ${drawerOpen ? "open" : ""}`}>
        <div className="dash-dr-head">
          <span className="dash-dr-title">RECT Sound</span>
          <button
            type="button"
            className="dash-dr-close"
            onClick={() => setDrawerOpen(false)}
          >
            ✕
          </button>
        </div>
        <div className="dash-dr-user">
          <p className="dash-dr-name">{displayName}</p>
          <SignOutButton />
        </div>
        <Link href="/charts" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Charts</span>
          <span>›</span>
        </Link>
        <Link href="/profile" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Profile</span>
          <span>›</span>
        </Link>
        <Link href="/" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Home</span>
          <span>›</span>
        </Link>
      </aside>

      <header className="dash-topbar">
        <div className="dash-logo-wrap">
          <div className="dash-logo-box">
            <span className="dash-logo-ect">RECT</span>
          </div>
          <div className="dash-logo-divider" />
          <span className="dash-logo-section">Sound</span>
        </div>
        <div className="dash-tb-r">
          <span className="dash-user-name" data-testid="dashboard-display-name">
            {displayName}
          </span>
          <button
            type="button"
            className="dash-ib"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>
        </div>
      </header>

      <div className="dash-hub">
        <span className="dash-hub-label">RECT Hub</span>
        <div className="dash-hub-sep" />
        <Link href="/charts" className="dash-hub-exit">
          Charts <span className="dash-hub-arr">↗</span>
        </Link>
        <Link href="/search" className="dash-hub-exit">
          Search <span className="dash-hub-arr">↗</span>
        </Link>
        <Link href="/profile" className="dash-hub-exit">
          You <span className="dash-hub-arr">↗</span>
        </Link>
      </div>

      <div className="dash-page">
        <div className="dash-layout">
        {/* CONNECTION 2 — Featured / vinyl now-playing */}
        <section className="dash-now" aria-label="Now playing">
          {featuredError ? (
            <div className="dash-empty" role="alert">
              <p className="dash-empty-title">Could not load tracks</p>
              <p className="dash-empty-body">{featuredError}</p>
            </div>
          ) : featured.length === 0 ? (
            <div className="dash-empty">
              <p className="dash-empty-title">No tracks yet. Artists are uploading.</p>
            </div>
          ) : active ? (
            <div className="dash-ni-glass">
              <div className="dash-ni-art">
                <div className="dash-ni-grad" />
                <div
                  className={`dash-ni-vinyl ${player.playing && player.track?.id === active.id ? "playing" : ""}`}
                >
                  <div className="dash-ni-vinyl-center" />
                </div>
                <div className="dash-ni-social">
                  <span className="dash-ns-count">
                    {formatPlayCount(active.play_count)} plays
                  </span>
                </div>
                <div className="dash-ni-identity">
                  <div className="dash-ni-artist">{trackArtist(active)}</div>
                  <div className="dash-ni-track">
                    {trackTitle(active)}
                    {active.genre ? ` · ${active.genre}` : ""}
                  </div>
                </div>
              </div>
              <div className="dash-now-controls">
                <div className="dash-ctrl-row">
                  <div className="dash-ctrl-meta">
                    <div className="dash-ctrl-song">{trackTitle(active)}</div>
                    <div className="dash-ctrl-info">
                      {trackArtist(active)} · {formatPlayCount(active.play_count)}{" "}
                      plays
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`dash-act-btn ${liked ? "liked" : ""}`}
                    onClick={() => setLiked((v) => !v)}
                    aria-label="Like"
                  >
                    {liked ? "♥" : "♡"}
                  </button>
                  <button
                    type="button"
                    className={`dash-play-big ${player.playing && player.track?.id === active.id ? "playing" : ""}`}
                    onClick={toggleHero}
                    disabled={!active.audio_url}
                    aria-label={player.playing ? "Pause" : "Play"}
                  >
                    {player.playing && player.track?.id === active.id ? "⏸" : "▶"}
                  </button>
                </div>
                <div className="dash-prog-zone">
                  <div className="dash-prog-track">
                    <div
                      className="dash-prog-fill"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="dash-prog-times">
                    <span>{formatTime(player.currentTime)}</span>
                    <span>{formatTime(player.duration)}</span>
                  </div>
                </div>
                {featured.length > 1 ? (
                  <div className="dash-featured-list">
                    {featured.slice(0, 6).map((t, i) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`dash-feat-row ${active.id === t.id ? "on" : ""}`}
                        onClick={() => playFeatured(t)}
                      >
                        <span>{i + 1}</span>
                        <span className="dash-feat-title">{trackTitle(t)}</span>
                        <span className="dash-feat-artist">{trackArtist(t)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        <div className="dash-side">
        {/* CONNECTION 4 — Artist portals */}
        <div className="dash-sh">
          <span className="dash-sh-t">Portals</span>
          <Link href="/search" className="dash-sh-m">
            All →
          </Link>
        </div>
        {artistsError ? (
          <div className="dash-empty" role="alert">
            <p className="dash-empty-title">Could not load artists</p>
            <p className="dash-empty-body">{artistsError}</p>
          </div>
        ) : artists.length === 0 ? (
          <div className="dash-empty">
            <p className="dash-empty-title">Artists joining soon.</p>
          </div>
        ) : (
          <div className="dash-scroll">
            {artists.map((a, i) => (
              <div key={a.id} className="dash-portal-card">
                <div className={`dash-pc-art ${PORTAL_BG[i % PORTAL_BG.length]}`}>
                  <div className="dash-pc-shade" />
                  <div className="dash-pc-tag">OPEN</div>
                </div>
                <div className="dash-pc-name">{a.display_name}</div>
                <div className="dash-pc-genre">{a.genre || "Artist"}</div>
              </div>
            ))}
          </div>
        )}

        {/* CONNECTION 5 — Play packs (hide entirely if empty) */}
        {packs.length > 0 ? (
          <>
            <div className="dash-sh">
              <span className="dash-sh-t">Play packs · SN</span>
            </div>
            <div className="dash-packs">
              {packs.map((p) => (
                <div key={p.id} className="dash-pack">
                  <div className="dash-pack-code">{p.code}</div>
                  <div className="dash-pack-name">{p.name}</div>
                  {p.description ? (
                    <p className="dash-pack-desc">{p.description}</p>
                  ) : null}
                  <div className="dash-pack-meta">
                    {p.price_label ? <span>{p.price_label}</span> : null}
                    {p.play_credits != null ? (
                      <span>{p.play_credits} plays</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
        </div>
        </div>

        <div className="dash-bottom-pad" />
      </div>

      {/* Mini player when something is loaded */}
      {player.track ? (
        <div className="dash-mini">
          <div className="dash-mp-prog">
            <div className="dash-mp-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="dash-mp-row">
            <div className="dash-mp-info">
              <div className="dash-mp-song">{trackTitle(player.track)}</div>
              <div className="dash-mp-artist">{trackArtist(player.track)}</div>
            </div>
            <button
              type="button"
              className="dash-mp-play"
              onClick={() => player.toggle()}
            >
              {player.playing ? "⏸" : "▶"}
            </button>
          </div>
        </div>
      ) : null}

      <nav className="dash-nav">
        <Link href="/dashboard" className="dash-ni on">
          <span className="dash-ni-ico">🏠</span>
          <span className="dash-ni-lbl">Home</span>
        </Link>
        <Link href="/search" className="dash-ni">
          <span className="dash-ni-ico">🔍</span>
          <span className="dash-ni-lbl">Search</span>
        </Link>
        <Link href="/charts" className="dash-ni">
          <span className="dash-ni-ico">📊</span>
          <span className="dash-ni-lbl">Charts</span>
        </Link>
        <Link href="/profile" className="dash-ni">
          <span className="dash-ni-ico">👤</span>
          <span className="dash-ni-lbl">You</span>
        </Link>
      </nav>
    </div>
  );
}
