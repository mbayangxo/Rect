"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ActivityThanksButton } from "@/components/activity-thanks-button";
import { AddToPlaylist } from "@/components/add-to-playlist";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { AppDrawerNav } from "@/components/app-drawer-nav";
import { HearthHero } from "@/components/hearth/hearth-hero";
import { HearthPulse } from "@/components/hearth/hearth-pulse";
import { HearthTrackGrid } from "@/components/hearth/hearth-track-grid";
import { HomeShelf, type ShelfTrack } from "@/components/hearth/home-shelf";
import { HomeShowShelf } from "@/components/hearth/home-show-shelf";
import { InboxPlaylistActions } from "@/components/inbox-playlist-actions";
import { InboxTrackPlay } from "@/components/inbox-track-play";
import { usePlayer } from "@/components/player-provider";
import { PlayPacksPanel } from "@/components/play-packs-panel";
import { TrackCover } from "@/components/track-cover";
import { TrackLikeButton } from "@/components/track-like-button";
import type { ArtistPortal } from "@/lib/dashboard/artists";
import type { LivePresenceItem } from "@/lib/dashboard/live-presence";
import type { LiveRoom } from "@/lib/dashboard/live-rooms";
import type { HearingAidEpisode } from "@/lib/dashboard/hearing-aids";
import type { NewSoundsTrack } from "@/lib/dashboard/new-sounds";
import type { NewWaveShow } from "@/lib/dashboard/new-wave-shows";
import type { PopularTourEvent } from "@/lib/dashboard/tour-events";
import type {
  TrendingPortal,
  TrendingTrack,
} from "@/lib/dashboard/trending";
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
  /** Unread release alerts for /inbox */
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
  liveNow?: LiveRoom[];
  livePresence?: LivePresenceItem[];
  trendingTracks?: TrendingTrack[];
  trendingPortals?: TrendingPortal[];
  newSoundsTracks?: NewSoundsTrack[];
  newWaveShows?: NewWaveShow[];
  liveParties?: NewWaveShow[];
  hearingAids?: HearingAidEpisode[];
  tourEvents?: PopularTourEvent[];
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
  liveNow = [],
  livePresence = [],
  trendingTracks = [],
  trendingPortals = [],
  newSoundsTracks = [],
  newWaveShows = [],
  liveParties = [],
  hearingAids = [],
  tourEvents = [],
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

  const nowPlaying = useMemo(() => {
    if (!player.track) return null;
    const match = featured.find((t) => t.id === player.track?.id);
    return (
      match ?? {
        ...player.track,
        play_count: 0,
        like_count: 0,
        artist_name: player.track.artist_name ?? null,
      }
    );
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
    if (!nowPlaying?.audio_url) return;
    player.toggle();
  }

  const liked = nowPlaying ? likedIds.has(nowPlaying.id) : false;

  async function toggleLike() {
    if (!nowPlaying || !likesReady || likePending) return;
    setLikeError(null);
    setLikePending(true);
    const trackId = nowPlaying.id;
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
          <span className="dash-dr-title">Menu</span>
          <button
            type="button"
            className="dash-dr-close"
            onClick={() => setDrawerOpen(false)}
          >
            ✕
          </button>
        </div>
        <AppDrawerNav
          displayName={displayName}
          inboxUnread={inboxUnread}
          onNavigate={() => setDrawerOpen(false)}
        />
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

      <div className="dash-page mx-auto w-full max-w-7xl px-4 pb-28 sm:px-8">
        <HearthHero
          displayName={displayName}
          liveCount={livePresence.length || liveNow.length}
          inboxUnread={inboxUnread}
          creditBalance={creditBalance}
          creditsReady={creditsReady}
        />

        <div className="home-shelves" aria-label="Home shelves">
          {continueItems.length > 0 ? (
            <HomeShelf
              kicker="Pick up"
              title="Continue listening"
              seeAllHref="/journal"
              seeAllLabel="Journal →"
              tracks={continueItems.map(
                (t): ShelfTrack => ({
                  ...t,
                  subtitle: formatPlayedAt(t.played_at),
                }),
              )}
              onPlay={(track, index) => {
                const list = continueItems.filter((x) => x.audio_url);
                const idx = list.findIndex((x) => x.id === track.id);
                player.playQueue(list, idx >= 0 ? idx : index);
              }}
            />
          ) : null}

          {newSoundsTracks.length > 0 ? (
            <HomeShelf
              kicker="Just dropped"
              title="New Sounds"
              seeAllHref="/new-sounds"
              seeAllLabel="Full mix →"
              tracks={newSoundsTracks.map(
                (t): ShelfTrack => ({
                  ...t,
                  subtitle: t.artist_name,
                }),
              )}
              onPlay={(track, index) => {
                const list = newSoundsTracks.filter((x) => x.audio_url);
                const idx = list.findIndex((x) => x.id === track.id);
                player.playQueue(list, idx >= 0 ? idx : index);
              }}
            />
          ) : null}

          {newWaveShows.length > 0 ? (
            <HomeShowShelf
              kicker="On Wave"
              title="New Wave"
              seeAllHref="/new-wave"
              seeAllLabel="All shows →"
              shows={newWaveShows}
            />
          ) : null}

          {liveParties.length > 0 ? (
            <HomeShowShelf
              kicker="Together"
              title="Listening parties"
              seeAllHref="/parties"
              seeAllLabel="Host or join →"
              shows={liveParties}
            />
          ) : null}

          {hearingAids.length > 0 ? (
            <HomeShelf
              kicker="Talk · podcasts"
              title="Hearing Aids"
              seeAllHref="/hearing-aids"
              seeAllLabel="All episodes →"
              tracks={hearingAids.map(
                (t): ShelfTrack => ({
                  ...t,
                  subtitle: t.artist_name,
                }),
              )}
              onPlay={(track, index) => {
                const list = hearingAids.filter((x) => x.audio_url);
                const idx = list.findIndex((x) => x.id === track.id);
                player.playQueue(list, idx >= 0 ? idx : index);
              }}
            />
          ) : null}

          {tourEvents.length > 0 ? (
            <section className="home-shelf" aria-label="Tour events">
              <div className="home-shelf-head">
                <div>
                  <p className="home-shelf-kicker">On the road</p>
                  <h2 className="home-shelf-title">Popular upcoming shows</h2>
                </div>
                <Link href="/discover" className="home-shelf-more">
                  Discover →
                </Link>
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
                              ? {
                                  backgroundImage: `url(${e.artist_avatar})`,
                                }
                              : undefined
                        }
                      >
                        <span className="home-shelf-play">◉</span>
                      </span>
                      <span className="home-shelf-copy">
                        <span className="home-shelf-name">{e.title}</span>
                        <span className="home-shelf-sub">
                          {[e.artist_name, e.city].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {friendsListening.length > 0 ? (
            <HomeShelf
              kicker="With friends"
              title="Friends listening"
              seeAllHref="/following"
              seeAllLabel="Following →"
              tracks={friendsListening.map(
                (t): ShelfTrack => ({
                  ...t,
                  subtitle: t.listener_name,
                }),
              )}
              onPlay={(track, index) => {
                const list = friendsListening.filter((x) => x.audio_url);
                const idx = list.findIndex((x) => x.id === track.id);
                player.playQueue(list, idx >= 0 ? idx : index);
              }}
            />
          ) : null}
        </div>

        <HearthPulse
          livePresence={
            livePresence.length > 0
              ? livePresence
              : liveNow.map((r) => ({
                  id: `room:${r.id}`,
                  kind: "live_room" as const,
                  artist_id: r.artist_id,
                  artist_name: r.artist_name || "Artist",
                  artist_avatar: r.artist_avatar ?? null,
                  title: r.title,
                  href: `/artists/${r.artist_id}/live/${r.id}`,
                  viewer_count: r.viewer_count,
                  modeLabel: r.mode || "live",
                  place:
                    [r.neighborhood, r.city, r.country]
                      .filter(Boolean)
                      .join(" · ") || null,
                }))
          }
          trendingTracks={trendingTracks}
          trendingPortals={trendingPortals}
          featured={featured}
          newWaveShows={newWaveShows}
          newSoundsTracks={newSoundsTracks}
          hearingAids={hearingAids}
        />

        <div className="dash-layout flex flex-col gap-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-10">
        {/* Featured — browse when idle; hero only while something is loaded */}
        <section
          className="dash-now lg:col-span-7 lg:sticky lg:top-4 lg:m-0"
          aria-label={nowPlaying ? "Now playing" : "For you"}
        >
          {featuredError ? (
            <div className="dash-empty" role="alert">
              <p className="dash-empty-title">Could not load tracks</p>
              <p className="dash-empty-body">{featuredError}</p>
            </div>
          ) : featured.length === 0 ? (
            <div className="dash-empty">
              <p className="dash-empty-title">No tracks yet. Artists are uploading.</p>
            </div>
          ) : nowPlaying ? (
            <div className="dash-ni-glass">
              <div
                className="dash-ni-art min-h-[190px] sm:min-h-[280px] lg:min-h-[340px]"
                style={
                  nowPlaying.cover_art_url
                    ? {
                        backgroundImage: `linear-gradient(to top, rgba(4,13,6,0.92) 0%, rgba(4,13,6,0.35) 45%, rgba(4,13,6,0.55) 100%), url(${nowPlaying.cover_art_url})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : undefined
                }
              >
                <div className="dash-ni-grad" />
                <div
                  className={`dash-ni-vinyl h-[110px] w-[110px] sm:h-[150px] sm:w-[150px] lg:h-[170px] lg:w-[170px] ${player.playing ? "playing" : ""}`}
                  style={
                    nowPlaying.cover_art_url
                      ? {
                          backgroundImage: `url(${nowPlaying.cover_art_url})`,
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
                    {formatPlayCount(nowPlaying.play_count)} plays
                    {(nowPlaying.like_count ?? 0) > 0
                      ? ` · ${formatPlayCount(nowPlaying.like_count)} likes`
                      : ""}
                  </span>
                </div>
                <div className="dash-ni-identity">
                  <div className="dash-ni-artist text-3xl sm:text-4xl lg:text-5xl">
                    {trackArtist(nowPlaying)}
                  </div>
                  <div className="dash-ni-track">
                    {trackTitle(nowPlaying)}
                    {nowPlaying.genre ? ` · ${nowPlaying.genre}` : ""}
                  </div>
                </div>
              </div>
              <div className="dash-now-controls">
                <div className="dash-ctrl-row">
                  <div className="dash-ctrl-meta">
                    <div className="dash-ctrl-song">{trackTitle(nowPlaying)}</div>
                    <div className="dash-ctrl-info">
                      {trackArtist(nowPlaying)} ·{" "}
                      {formatPlayCount(nowPlaying.play_count)} plays
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`dash-act-btn ${liked ? "liked" : ""}`}
                    onClick={() => void toggleLike()}
                    disabled={!likesReady || likePending}
                    aria-label={liked ? "Unlike" : "Like"}
                    title={
                      likesReady
                        ? liked
                          ? "Unlike"
                          : "Save"
                        : "Run track likes SQL in Supabase"
                    }
                  >
                    {liked ? "♥" : "♡"}
                  </button>
                  <div className="hidden sm:flex sm:items-center">
                    <AddToPlaylist
                      trackId={nowPlaying.id}
                      compact
                      loginNext="/dashboard"
                    />
                  </div>
                  <button
                    type="button"
                    className={`dash-play-big ${player.playing ? "playing" : ""}`}
                    onClick={toggleHero}
                    disabled={!nowPlaying.audio_url}
                    aria-label={player.playing ? "Pause" : "Play"}
                  >
                    {player.playing ? "⏸" : "▶"}
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
              </div>
            </div>
          ) : (
            <HearthTrackGrid
              tracks={featured}
              personalized={personalized}
              tasteGenres={tasteGenres}
              tasteCountries={tasteCountries}
              tasteDaypart={tasteDaypart}
              likedTrackIds={likedIds}
              likesReady={likesReady}
              onPlay={playFeatured}
            />
          )}
        </section>

        <aside className="hearth-orbit dash-side lg:col-span-5">
        <div className="hearth-zone-head hearth-zone-head-orbit">
          <div>
            <p className="hearth-zone-kicker">Around you</p>
            <h2 className="hearth-zone-title">Your orbit</h2>
          </div>
          <Link href="/following" className="hearth-zone-link">
            Following →
          </Link>
        </div>
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
                        <TrackCover track={t} size="sm" href={`/songs/${t.id}`} />
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
                        <TrackCover track={t} size="sm" href={`/songs/${t.id}`} />
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
                        <TrackCover track={t} size="sm" href={`/songs/${t.id}`} />
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
        </aside>
        </div>

        <div className="dash-bottom-pad" />
      </div>

      <AppBottomNav />
    </div>
  );
}
