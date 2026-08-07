"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePlayer } from "@/components/player-provider";
import { PlayPacksPanel } from "@/components/play-packs-panel";
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
  packCountry: string;
  personalized: boolean;
  tasteGenres: string[];
  creditBalance: number;
  creditsReady: boolean;
  likedTrackIds: string[];
  likesReady: boolean;
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
  packCountry,
  personalized,
  tasteGenres,
  creditBalance,
  creditsReady,
  likedTrackIds,
  likesReady,
}: Props) {
  const player = usePlayer();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [likedIds, setLikedIds] = useState(() => new Set(likedTrackIds));
  const [likePending, setLikePending] = useState(false);
  const [likeError, setLikeError] = useState<string | null>(null);

  useEffect(() => {
    setLikedIds(new Set(likedTrackIds));
  }, [likedTrackIds]);

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

  const liked = active ? likedIds.has(active.id) : false;

  async function toggleLike() {
    if (!active || !likesReady || likePending) return;
    setLikeError(null);
    setLikePending(true);
    const trackId = active.id;
    const prev = likedIds.has(trackId);
    setLikedIds((set) => {
      const next = new Set(set);
      if (prev) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
    try {
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_id: trackId }),
      });
      const data = (await res.json()) as {
        error?: string;
        liked?: boolean;
      };
      if (!res.ok || data.error) {
        setLikedIds((set) => {
          const next = new Set(set);
          if (prev) next.add(trackId);
          else next.delete(trackId);
          return next;
        });
        setLikeError(data.error || "Could not save like");
        return;
      }
      setLikedIds((set) => {
        const next = new Set(set);
        if (data.liked) next.add(trackId);
        else next.delete(trackId);
        return next;
      });
    } catch (e) {
      setLikedIds((set) => {
        const next = new Set(set);
        if (prev) next.add(trackId);
        else next.delete(trackId);
        return next;
      });
      setLikeError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLikePending(false);
    }
  }

  return (
    <div className="dash-app w-full min-h-dvh max-w-none">
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
        <Link href="/library" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Liked songs</span>
          <span>›</span>
        </Link>
        <Link href="/journal" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Listening journal</span>
          <span>›</span>
        </Link>
        <Link href="/charts" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Charts</span>
          <span>›</span>
        </Link>        <Link href="/profile" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Profile</span>
          <span>›</span>
        </Link>
        <Link href="/" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Landing</span>
          <span>›</span>
        </Link>
      </aside>

      <header className="dash-topbar mx-auto w-full max-w-7xl px-4 sm:px-8">
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

      <div className="dash-hub mx-auto w-full max-w-7xl px-4 sm:px-8">
        <span className="dash-hub-label">RECT Hub</span>
        <div className="dash-hub-sep" />
        <Link href="/library" className="dash-hub-exit">
          Liked <span className="dash-hub-arr">↗</span>
        </Link>
        <Link href="/journal" className="dash-hub-exit">
          Journal <span className="dash-hub-arr">↗</span>
        </Link>
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

      <div className="dash-page mx-auto w-full max-w-7xl px-4 pb-28 sm:px-8">
        <div className="dash-layout flex flex-col gap-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-10">
        {/* CONNECTION 2 — Featured / vinyl now-playing */}
        <section className="dash-now lg:col-span-7 lg:sticky lg:top-4 lg:m-0" aria-label="Now playing">
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
              <div className="dash-ni-art min-h-[190px] sm:min-h-[280px] lg:min-h-[340px]">
                <div className="dash-ni-grad" />
                <div
                  className={`dash-ni-vinyl h-[110px] w-[110px] sm:h-[150px] sm:w-[150px] lg:h-[170px] lg:w-[170px] ${player.playing && player.track?.id === active.id ? "playing" : ""}`}
                >
                  <div className="dash-ni-vinyl-center" />
                </div>
                <div className="dash-ni-social">
                  <span className="dash-ns-count">
                    {personalized ? "For you · " : ""}
                    {formatPlayCount(active.play_count)} plays
                  </span>
                </div>
                <div className="dash-ni-identity">
                  <div className="dash-ni-artist text-3xl sm:text-4xl lg:text-5xl">{trackArtist(active)}</div>
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
                    onClick={() => void toggleLike()}
                    disabled={!active || !likesReady || likePending}
                    aria-label={liked ? "Unlike" : "Like"}
                    title={
                      likesReady
                        ? liked
                          ? "Unlike"
                          : "Like"
                        : "Run track likes SQL in Supabase"
                    }
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
                {likeError ? (
                  <p className="mt-2 text-xs text-[#F5A623]">{likeError}</p>
                ) : null}
                {featured.length > 1 ? (
                  <div className="dash-featured-list">
                    {personalized && tasteGenres.length > 0 ? (
                      <p className="mb-2 px-1 text-[0.58rem] uppercase tracking-[0.12em] text-white/35">
                        Tuned to {tasteGenres.join(" · ")}
                      </p>
                    ) : null}
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

        <div className="dash-side lg:col-span-5">
        {/* CONNECTION 4 — Artist portals */}
        <div className="dash-sh px-0">
          <span className="dash-sh-t">
            {personalized ? "Portals for you" : "Portals"}
          </span>
          <Link href="/search" className="dash-sh-m">
            All →
          </Link>
        </div>
        {artistsError ? (
          <div className="dash-empty !mx-0" role="alert">
            <p className="dash-empty-title">Could not load artists</p>
            <p className="dash-empty-body">{artistsError}</p>
          </div>
        ) : artists.length === 0 ? (
          <div className="dash-empty !mx-0">
            <p className="dash-empty-title">Artists joining soon.</p>
          </div>
        ) : (
          <div className="dash-scroll flex flex-wrap gap-4 px-0">
            {artists.map((a, i) => (
              <Link
                key={a.id}
                href={`/artists/${a.id}`}
                className="dash-portal-card"
              >
                <div className={`dash-pc-art ${PORTAL_BG[i % PORTAL_BG.length]}`}>
                  <div className="dash-pc-shade" />
                  <div className="dash-pc-tag">OPEN</div>
                </div>
                <div className="dash-pc-name">{a.display_name}</div>
                <div className="dash-pc-genre">{a.genre || "Artist"}</div>
              </Link>
            ))}
          </div>
        )}

        {/* CONNECTION 5 — Play packs (hide entirely if empty) */}
        {packs.length > 0 ? (
          <PlayPacksPanel
            packs={packs}
            country={packCountry}
            initialCredits={creditBalance}
            creditsReady={creditsReady}
          />
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
        <Link href="/library" className="dash-ni">
          <span className="dash-ni-ico">♥</span>
          <span className="dash-ni-lbl">Liked</span>
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
