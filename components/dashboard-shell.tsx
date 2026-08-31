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
import type { PendingPackPurchase } from "@/lib/dashboard/credits";
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
  tasteDaypart?: string | null;
  creditBalance: number;
  creditsReady: boolean;
  pendingPackPurchases?: PendingPackPurchase[];
  likedTrackIds: string[];
  likesReady: boolean;
  inboxUnread?: number;
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
  tasteDaypart = null,
  creditBalance,
  creditsReady,
  pendingPackPurchases = [],
  likedTrackIds,
  likesReady,
  inboxUnread = 0,
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

  useEffect(() => {
    const scrollToPacks = () => {
      if (typeof window === "undefined") return;
      if (window.location.hash !== "#packs") return;
      window.requestAnimationFrame(() => {
        document
          .getElementById("packs")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    scrollToPacks();
    window.addEventListener("hashchange", scrollToPacks);
    return () => window.removeEventListener("hashchange", scrollToPacks);
  }, []);

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

  const playableFeatured = useMemo(
    () => featured.filter((t) => Boolean(t.audio_url)),
    [featured],
  );

  const pct =
    player.duration > 0
      ? Math.min(100, (player.currentTime / player.duration) * 100)
      : 0;

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
        <p className="dash-dr-group">Listen</p>
        <Link href="/search" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Search</span>
          <span>›</span>
        </Link>
        <Link href="/library" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Library</span>
          <span>›</span>
        </Link>
        <Link href="/charts" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Charts</span>
          <span>›</span>
        </Link>
        <Link href="/radio" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Wave</span>
          <span>›</span>
        </Link>
        <Link href="/new" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>New releases</span>
          <span>›</span>
        </Link>
        <p className="dash-dr-group">Your people</p>
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
        <p className="dash-dr-group">Browse</p>
        <Link href="/genres" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Genres</span>
          <span>›</span>
        </Link>
        <Link href="/places" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Places</span>
          <span>›</span>
        </Link>
        <Link href="/languages" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Languages</span>
          <span>›</span>
        </Link>
        <p className="dash-dr-group">You</p>
        <Link href="/profile" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Profile</span>
          <span>›</span>
        </Link>
        <Link href="/journal" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Journal</span>
          <span>›</span>
        </Link>
        <Link href="/tips" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Tips</span>
          <span>›</span>
        </Link>
        <Link href="/artist" className="dash-dmi" onClick={() => setDrawerOpen(false)}>
          <span>Artist OS</span>
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

      <nav className="dash-hub mx-auto w-full max-w-7xl px-4 sm:px-8" aria-label="Shortcuts">
        <Link href="/following" className="dash-hub-exit">
          Following
        </Link>
        <Link href="/inbox" className="dash-hub-exit">
          Inbox
          {inboxUnread > 0 ? ` · ${inboxUnread}` : ""}
        </Link>
        <Link href="/playlists" className="dash-hub-exit">
          Playlists
        </Link>
      </nav>

      <div className="dash-page mx-auto w-full max-w-7xl px-4 pb-28 sm:px-8">
        <div className="dash-layout flex flex-col gap-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-10">
        <section className="dash-now lg:col-span-7 lg:m-0" aria-label="For you">
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
            <div className="dash-listen">
              <div className="dash-listen-head">
                <h2 className="dash-listen-title">
                  {personalized ? "For you" : "Listen"}
                </h2>
                {personalized &&
                (tasteGenres.length > 0 ||
                  tasteCountries.length > 0 ||
                  tasteDaypart) ? (
                  <p className="dash-listen-taste">
                    {tasteGenres.map((g, i) => {
                      const slug = genreToSlug(g);
                      return (
                        <span key={`g-${g}`}>
                          {i > 0 ? " · " : ""}
                          {slug ? (
                            <Link href={`/genres/${slug}`}>{g}</Link>
                          ) : (
                            g
                          )}
                        </span>
                      );
                    })}
                    {tasteGenres.length > 0 && tasteCountries.length > 0
                      ? " · "
                      : null}
                    {tasteCountries.map((c, i) => {
                      const slug = placeToSlug(c);
                      return (
                        <span key={`c-${c}`}>
                          {i > 0 ? " · " : ""}
                          {slug ? (
                            <Link href={`/places/${slug}`}>{c}</Link>
                          ) : (
                            c
                          )}
                        </span>
                      );
                    })}
                    {tasteDaypart
                      ? `${tasteGenres.length > 0 || tasteCountries.length > 0 ? " · " : ""}${tasteDaypart}`
                      : null}
                  </p>
                ) : null}
              </div>

              <div className="dash-listen-card">
                <TrackCover track={active} size="lg" className="!h-[72px] !w-[72px] rounded-xl" />
                <div className="dash-listen-meta">
                  <p className="dash-listen-song">{trackTitle(active)}</p>
                  <p className="dash-listen-artist">
                    {trackArtist(active)}
                    {active.genre ? ` · ${active.genre}` : ""}
                  </p>
                  <p className="dash-listen-plays">
                    {formatPlayCount(active.play_count)} plays
                    {(active.like_count ?? 0) > 0
                      ? ` · ${formatPlayCount(active.like_count)} likes`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className={`dash-act-btn ${liked ? "liked" : ""}`}
                  onClick={() => void toggleLike()}
                  disabled={!active || !likesReady || likePending}
                  aria-label={liked ? "Unlike" : "Like"}
                >
                  {liked ? "♥" : "♡"}
                </button>
                <button
                  type="button"
                  className="dash-play-big"
                  onClick={toggleHero}
                  disabled={!active.audio_url}
                  aria-label={
                    player.playing && player.track?.id === active.id
                      ? "Pause"
                      : "Play"
                  }
                >
                  {player.playing && player.track?.id === active.id ? "⏸" : "▶"}
                </button>
              </div>
              {player.track?.id === active.id ? (
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
              ) : null}
              {likeError ? (
                <p className="mt-2 text-xs text-[#F5A623]">{likeError}</p>
              ) : null}

              {featured.length > 0 ? (
                <ol className="dash-featured-list">
                  {featured.slice(0, 8).map((t, i) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className={`dash-feat-row ${active.id === t.id ? "on" : ""}`}
                        onClick={() => {
                          const idx = playableFeatured.findIndex((x) => x.id === t.id);
                          if (idx >= 0) player.playQueue(playableFeatured, idx);
                        }}
                      >
                        <span className="dash-feat-rank">{i + 1}</span>
                        <span className="dash-feat-copy">
                          <span className="dash-feat-title">{trackTitle(t)}</span>
                          <span className="dash-feat-artist">
                            {trackArtist(t)}
                          </span>
                        </span>
                        <span className="dash-feat-time">
                          {formatTrackDuration(t.duration_secs) || ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}
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
        <div id="packs" className="scroll-mt-24">
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
            initialPending={pendingPackPurchases}
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
        </div>

        <div className={`dash-bottom-pad ${player.track ? "playing" : ""}`} />
      </div>

      <nav className={`dash-nav ${player.track ? "lifted" : ""}`}>
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
