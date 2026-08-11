"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ActivityThanksButton } from "@/components/activity-thanks-button";
import { InboxPlaylistActions } from "@/components/inbox-playlist-actions";
import { InboxTrackPlay } from "@/components/inbox-track-play";
import { usePlayer } from "@/components/player-provider";
import { PlayPacksPanel } from "@/components/play-packs-panel";
import { SignOutButton } from "@/components/sign-out-button";
import { TrackCover } from "@/components/track-cover";
import { TrackLikeButton } from "@/components/track-like-button";
import type { ArtistPortal } from "@/lib/dashboard/artists";
import {
  formatPlayedAt,
  type JournalEntry,
} from "@/lib/dashboard/listening-journal";
import type {
  FriendsLikeItem,
  FriendsListenItem,
  FriendsMixItem,
} from "@/lib/dashboard/people-follows";
import { personProfileHref } from "@/lib/dashboard/people";
import type { PlayPack } from "@/lib/dashboard/play-packs";
import { genreToSlug } from "@/lib/dashboard/genres";
import { placeToSlug } from "@/lib/dashboard/places";
import {
  formatPlayCount,
  trackArtist,
  trackTitle,
  type RankedTrack,
} from "@/lib/dashboard/tracks";
import { formatTrackDuration, type TrackRow } from "@/lib/tracks";

type Props = {
  displayName: string;
  featured: RankedTrack[];
  featuredError: string | null;
  artists: ArtistPortal[];
  artistsError: string | null;
  packs: PlayPack[];
  packsError: string | null;
  packCountry: string;
  personalized: boolean;
  tasteGenres: string[];
  tasteCountries: string[];
  creditBalance: number;
  creditsReady: boolean;
  likedTrackIds: string[];
  likesReady: boolean;
  showArtistStudio?: boolean;
  /** Unread release alerts for /inbox */
  inboxUnread?: number;
  /** Unread studio activity for /artist/inbox */
  artistInboxUnread?: number;
  continueListening: JournalEntry[];
  continueError: string | null;
  friendsListening?: FriendsListenItem[];
  friendsError?: string | null;
  friendsLikes?: FriendsLikeItem[];
  friendsLikesError?: string | null;
  friendsMixes?: FriendsMixItem[];
  friendsMixesError?: string | null;
  followingPlaylists?: Record<string, boolean>;
  playlistFollowsReady?: boolean;
  playlistPreviewTracks?: Record<string, TrackRow>;
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
  packsError,
  packCountry,
  personalized,
  tasteGenres,
  tasteCountries,
  creditBalance,
  creditsReady,
  likedTrackIds,
  likesReady,
  showArtistStudio = false,
  inboxUnread = 0,
  artistInboxUnread = 0,
  continueListening,
  continueError,
  friendsListening = [],
  friendsError = null,
  friendsLikes = [],
  friendsLikesError = null,
  friendsMixes = [],
  friendsMixesError = null,
  followingPlaylists = {},
  playlistFollowsReady = false,
  playlistPreviewTracks = {},
}: Props) {
  const router = useRouter();
  const player = usePlayer();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [likedIds, setLikedIds] = useState(() => new Set(likedTrackIds));
  const [likePending, setLikePending] = useState(false);
  const [likeError, setLikeError] = useState<string | null>(null);
  const [continueItems, setContinueItems] = useState(continueListening);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [continueDismissError, setContinueDismissError] = useState<
    string | null
  >(null);

  useEffect(() => {
    setLikedIds(new Set(likedTrackIds));
  }, [likedTrackIds]);

  useEffect(() => {
    setContinueItems(continueListening);
  }, [continueListening]);

  async function dismissContinue(trackId: string) {
    if (dismissingId) return;
    setDismissingId(trackId);
    setContinueDismissError(null);
    const prev = continueItems;
    setContinueItems((list) => list.filter((t) => t.id !== trackId));
    try {
      const res = await fetch("/api/plays/journal", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_id: trackId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setContinueItems(prev);
        setContinueDismissError(data.error || "Could not dismiss");
        return;
      }
      router.refresh();
    } catch (e) {
      setContinueItems(prev);
      setContinueDismissError(
        e instanceof Error ? e.message : "Network error",
      );
    } finally {
      setDismissingId(null);
    }
  }

  const active = useMemo(() => {
    if (player.track) {
      const match = featured.find((t) => t.id === player.track?.id);
      return match ?? {
        ...player.track,
        play_count: 0,
        like_count: 0,
        artist_name: player.track.artist_name ?? null,
      };
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
          <span>Library</span>
          <span>›</span>
        </Link>
        <Link href="/following" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Following</span>
          <span>›</span>
        </Link>
        <Link href="/inbox" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Inbox{inboxUnread > 0 ? ` (${inboxUnread})` : ""}</span>
          <span>›</span>
        </Link>
        <Link href="/playlists" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Playlists</span>
          <span>›</span>
        </Link>
        <Link href="/tips" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>My tips</span>
          <span>›</span>
        </Link>
        {showArtistStudio ? (
          <Link href="/studio" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
            <span>Artist studio</span>
            <span>›</span>
          </Link>
        ) : (
          <Link href="/for-artists" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
            <span>Become an artist</span>
            <span>›</span>
          </Link>
        )}
        {showArtistStudio ? (
          <Link href="/artist/inbox" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
            <span>
              Artist inbox
              {artistInboxUnread > 0 ? ` (${artistInboxUnread})` : ""}
            </span>
            <span>›</span>
          </Link>
        ) : null}
        <Link href="/journal" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Listening journal</span>
          <span>›</span>
        </Link>
        <Link href="/radio" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>RECT Radio</span>
          <span>›</span>
        </Link>
        <Link href="/genres" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Genres</span>
          <span>›</span>
        </Link>
        <Link href="/languages" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Languages</span>
          <span>›</span>
        </Link>
        <Link href="/new" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>New releases</span>
          <span>›</span>
        </Link>
        <Link href="/places" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Places</span>
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
          Library <span className="dash-hub-arr">↗</span>
        </Link>
        <Link href="/following" className="dash-hub-exit">
          Following <span className="dash-hub-arr">↗</span>
        </Link>
        <Link href="/inbox" className="dash-hub-exit">
          Inbox
          {inboxUnread > 0 ? ` (${inboxUnread})` : ""}{" "}
          <span className="dash-hub-arr">↗</span>
        </Link>
        <Link href="/playlists" className="dash-hub-exit">
          Playlists <span className="dash-hub-arr">↗</span>
        </Link>
        <Link href="/tips" className="dash-hub-exit">
          Tips <span className="dash-hub-arr">↗</span>
        </Link>
        {showArtistStudio ? (
          <Link href="/studio" className="dash-hub-exit">
            Studio <span className="dash-hub-arr">↗</span>
          </Link>
        ) : (
          <Link href="/for-artists" className="dash-hub-exit">
            For artists <span className="dash-hub-arr">↗</span>
          </Link>
        )}
        {showArtistStudio ? (
          <Link href="/artist/inbox" className="dash-hub-exit">
            Studio inbox
            {artistInboxUnread > 0 ? ` (${artistInboxUnread})` : ""}{" "}
            <span className="dash-hub-arr">↗</span>
          </Link>
        ) : null}
        <Link href="/journal" className="dash-hub-exit">
          Journal <span className="dash-hub-arr">↗</span>
        </Link>
        <Link href="/radio" className="dash-hub-exit">
          Radio <span className="dash-hub-arr">↗</span>
        </Link>
        <Link href="/genres" className="dash-hub-exit">
          Genres <span className="dash-hub-arr">↗</span>
        </Link>
        <Link href="/languages" className="dash-hub-exit">
          Languages <span className="dash-hub-arr">↗</span>
        </Link>
        <Link href="/new" className="dash-hub-exit">
          New <span className="dash-hub-arr">↗</span>
        </Link>
        <Link href="/places" className="dash-hub-exit">
          Places <span className="dash-hub-arr">↗</span>
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
              <div
                className="dash-ni-art min-h-[190px] sm:min-h-[280px] lg:min-h-[340px]"
                style={
                  active.cover_art_url
                    ? {
                        backgroundImage: `linear-gradient(to top, rgba(4,13,6,0.92) 0%, rgba(4,13,6,0.35) 45%, rgba(4,13,6,0.55) 100%), url(${active.cover_art_url})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : undefined
                }
              >
                <div className="dash-ni-grad" />
                <div
                  className={`dash-ni-vinyl h-[110px] w-[110px] sm:h-[150px] sm:w-[150px] lg:h-[170px] lg:w-[170px] ${player.playing && player.track?.id === active.id ? "playing" : ""}`}
                  style={
                    active.cover_art_url
                      ? {
                          backgroundImage: `url(${active.cover_art_url})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                >
                  <div className="dash-ni-vinyl-center" />
                </div>
                <div className="dash-ni-social">
                  <span className="dash-ns-count">
                    {personalized ? "For you · " : ""}
                    {formatPlayCount(active.play_count)} plays
                    {(active.like_count ?? 0) > 0
                      ? ` · ${formatPlayCount(active.like_count)} likes`
                      : ""}
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
                    {personalized &&
                    (tasteGenres.length > 0 || tasteCountries.length > 0) ? (
                      <p className="mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 px-1 text-[0.58rem] uppercase tracking-[0.12em] text-white/35">
                        <span>Tuned to</span>
                        {tasteGenres.map((g, i) => {
                          const slug = genreToSlug(g);
                          return (
                            <span key={`g-${g}`} className="inline-flex items-center gap-1.5">
                              {i > 0 ? <span aria-hidden>·</span> : null}
                              {slug ? (
                                <Link
                                  href={`/genres/${slug}`}
                                  className="text-white/55 hover:text-[#1DB954]"
                                >
                                  {g}
                                </Link>
                              ) : (
                                <span>{g}</span>
                              )}
                            </span>
                          );
                        })}
                        {tasteGenres.length > 0 && tasteCountries.length > 0 ? (
                          <span aria-hidden>·</span>
                        ) : null}
                        {tasteCountries.map((c, i) => {
                          const slug = placeToSlug(c);
                          return (
                            <span key={`c-${c}`} className="inline-flex items-center gap-1.5">
                              {i > 0 ? <span aria-hidden>·</span> : null}
                              {slug ? (
                                <Link
                                  href={`/places/${slug}`}
                                  className="text-white/55 hover:text-[#1DB954]"
                                >
                                  {c}
                                </Link>
                              ) : (
                                <span>{c}</span>
                              )}
                            </span>
                          );
                        })}
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
                        <span className="dash-feat-artist">
                          {trackArtist(t)}
                          {formatTrackDuration(t.duration_secs)
                            ? ` · ${formatTrackDuration(t.duration_secs)}`
                            : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        <div className="dash-side lg:col-span-5">
        {(continueItems.length > 0 || continueError || continueDismissError) && (
          <>
            <div className="dash-sh px-0">
              <span className="dash-sh-t">Continue listening</span>
              <Link href="/journal" className="dash-sh-m">
                Journal →
              </Link>
            </div>
            {continueError ? (
              <div className="dash-empty !mx-0 mb-6" role="alert">
                <p className="dash-empty-title">Could not load history</p>
                <p className="dash-empty-body">{continueError}</p>
              </div>
            ) : (
              <>
                {continueDismissError ? (
                  <p className="mb-2 px-2 text-xs text-[#F5A623]" role="alert">
                    {continueDismissError}
                  </p>
                ) : null}
                <ul className="mb-8 space-y-1 px-0">
                  {continueItems.map((t, i) => (
                    <li
                      key={`${t.id}-${t.play_id}`}
                      className="flex items-center gap-1"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          player.playQueue(
                            continueItems.filter((x) => x.audio_url),
                            i,
                          )
                        }
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/[0.05]"
                      >
                        <TrackCover track={t} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">
                            {trackTitle(t)}
                          </p>
                          <p className="truncate text-xs text-white/40">
                            {trackArtist(t)} · {formatPlayedAt(t.played_at)}
                            {formatTrackDuration(t.duration_secs)
                              ? ` · ${formatTrackDuration(t.duration_secs)}`
                              : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-[#1DB954]">▶</span>
                      </button>
                      <button
                        type="button"
                        disabled={dismissingId === t.id}
                        onClick={() => void dismissContinue(t.id)}
                        className="shrink-0 rounded-full px-2 py-2 text-sm text-white/35 hover:bg-white/10 hover:text-white disabled:opacity-40"
                        aria-label={`Dismiss ${trackTitle(t)}`}
                        title="Remove from Continue"
                      >
                        {dismissingId === t.id ? "…" : "×"}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {(friendsListening.length > 0 || friendsError) && (
          <>
            <div className="dash-sh px-0">
              <span className="dash-sh-t">Friends listening</span>
              <Link href="/following" className="dash-sh-m">
                Following →
              </Link>
            </div>
            {friendsError ? (
              <div className="dash-empty !mx-0 mb-6" role="alert">
                <p className="dash-empty-title">Could not load friends</p>
                <p className="dash-empty-body">{friendsError}</p>
              </div>
            ) : (
              <ul className="mb-8 space-y-1 px-0">
                {friendsListening.map((t, i) => (
                  <li
                    key={`${t.listener_id}-${t.play_id}`}
                    className="rounded-xl px-2 py-1 hover:bg-white/[0.05]"
                  >
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          player.playQueue(
                            friendsListening.filter((x) => x.audio_url),
                            i,
                          )
                        }
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-0 py-1 text-left"
                      >
                        <TrackCover track={t} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">
                            {trackTitle(t)}
                          </p>
                          <p className="truncate text-xs text-white/40">
                            {t.listener_name} · {formatPlayedAt(t.played_at)}
                            {formatTrackDuration(t.duration_secs)
                              ? ` · ${formatTrackDuration(t.duration_secs)}`
                              : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-[#1DB954]">▶</span>
                      </button>
                      <Link
                        href={personProfileHref(t.listener_id)}
                        className="shrink-0 rounded-full px-2 py-2 text-xs text-white/40 hover:bg-white/10 hover:text-[#1DB954]"
                        title={t.listener_name}
                      >
                        →
                      </Link>
                      <TrackLikeButton
                        trackId={t.id}
                        initialLiked={likedIds.has(t.id)}
                        likesReady={likesReady}
                        loginNext="/dashboard"
                        compact
                      />
                    </div>
                    <ActivityThanksButton
                      playId={t.play_id}
                      initialThanks={t.thanks_message}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {(friendsLikes.length > 0 || friendsLikesError) && (
          <>
            <div className="dash-sh px-0">
              <span className="dash-sh-t">Friends liked</span>
              <Link href="/following" className="dash-sh-m">
                Following →
              </Link>
            </div>
            {friendsLikesError ? (
              <div className="dash-empty !mx-0 mb-6" role="alert">
                <p className="dash-empty-title">Could not load likes</p>
                <p className="dash-empty-body">{friendsLikesError}</p>
              </div>
            ) : (
              <ul className="mb-8 space-y-1 px-0">
                {friendsLikes.map((t, i) => (
                  <li
                    key={t.like_id}
                    className="rounded-xl px-2 py-1 hover:bg-white/[0.05]"
                  >
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          player.playQueue(
                            friendsLikes.filter((x) => x.audio_url),
                            i,
                          )
                        }
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-0 py-1 text-left"
                      >
                        <TrackCover track={t} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">
                            {trackTitle(t)}
                          </p>
                          <p className="truncate text-xs text-white/40">
                            {t.liker_name} · {formatPlayedAt(t.liked_at)}
                            {formatTrackDuration(t.duration_secs)
                              ? ` · ${formatTrackDuration(t.duration_secs)}`
                              : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-[#1DB954]">▶</span>
                      </button>
                      <Link
                        href={personProfileHref(t.liker_id)}
                        className="shrink-0 rounded-full px-2 py-2 text-xs text-white/40 hover:bg-white/10 hover:text-[#1DB954]"
                        title={t.liker_name}
                      >
                        →
                      </Link>
                      <TrackLikeButton
                        trackId={t.id}
                        initialLiked={likedIds.has(t.id)}
                        likesReady={likesReady}
                        loginNext="/dashboard"
                        compact
                      />
                    </div>
                    <ActivityThanksButton
                      likerId={t.liker_id}
                      trackId={t.id}
                      initialThanks={t.thanks_message}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {(friendsMixes.length > 0 || friendsMixesError) && (
          <>
            <div className="dash-sh px-0">
              <span className="dash-sh-t">Friends mixes</span>
              <Link href="/following" className="dash-sh-m">
                Following →
              </Link>
            </div>
            {friendsMixesError ? (
              <div className="dash-empty !mx-0 mb-6" role="alert">
                <p className="dash-empty-title">Could not load mixes</p>
                <p className="dash-empty-body">{friendsMixesError}</p>
              </div>
            ) : (
              <ul className="mb-8 space-y-1 px-0">
                {friendsMixes.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-xl px-2 py-1 hover:bg-white/[0.05]"
                  >
                    <Link
                      href={`/playlists/${p.id}`}
                      className="flex items-center gap-3 rounded-xl px-0 py-1"
                    >
                      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
                        {p.cover_art_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.cover_art_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-xs text-white/25">
                            ♫
                          </span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">
                          {p.name}
                        </p>
                        <p className="truncate text-xs text-white/40">
                          {p.owner_name}
                          {p.updated_at
                            ? ` · ${formatPlayedAt(p.updated_at)}`
                            : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-white/35">→</span>
                    </Link>
                    {playlistPreviewTracks[p.id] ? (
                      <InboxTrackPlay
                        track={playlistPreviewTracks[p.id]}
                        className="mt-1.5 rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
                      />
                    ) : null}
                    <InboxPlaylistActions
                      playlistId={p.id}
                      initialFollowing={Boolean(followingPlaylists[p.id])}
                      followsReady={playlistFollowsReady}
                      loginNext="/dashboard"
                    />
                    <ActivityThanksButton
                      playlistId={p.id}
                      initialThanks={p.thanks_message}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

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
                <div
                  className={`dash-pc-art ${PORTAL_BG[i % PORTAL_BG.length]}`}
                  style={
                    a.avatar_url
                      ? {
                          backgroundImage: `url(${a.avatar_url})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                >
                  <div className="dash-pc-shade" />
                  <div className="dash-pc-tag">OPEN</div>
                </div>
                <div className="dash-pc-name">{a.display_name}</div>
                <div className="dash-pc-genre">
                  {[a.countries[0], a.genre].filter(Boolean).join(" · ") ||
                    "Artist"}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* CONNECTION 5 — Play packs */}
        {packsError ? (
          <div className="dash-sh px-0">
            <span className="dash-sh-t">Play packs</span>
            <p className="mt-2 text-xs text-[#F5A623]" role="alert">
              {packsError}
            </p>
          </div>
        ) : packs.length > 0 ? (
          <PlayPacksPanel
            packs={packs}
            country={packCountry}
            initialCredits={creditBalance}
            creditsReady={creditsReady}
          />
        ) : (
          <div className="dash-sh px-0">
            <span className="dash-sh-t">Play packs · {packCountry}</span>
            <p className="mt-2 text-xs text-white/40">
              No packs seeded for this country yet.
            </p>
          </div>
        )}
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
          <span className="dash-ni-lbl">Library</span>
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
