"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ActivityThanksButton } from "@/components/activity-thanks-button";
import { AddToPlaylist } from "@/components/add-to-playlist";
import { InboxPlaylistActions } from "@/components/inbox-playlist-actions";
import { InboxTrackPlay } from "@/components/inbox-track-play";
import { usePlayer } from "@/components/player-provider";
import { RectLogo } from "@/components/rect-logo";
import { QueueTrackButton } from "@/components/queue-track-button";
import { ShareTrackButton } from "@/components/share-track-button";
import { TrackCover } from "@/components/track-cover";
import { TrackLikeButton } from "@/components/track-like-button";
import type {
  FollowedArtist,
  FollowingFeedTrack,
} from "@/lib/dashboard/follows";
import type {
  FollowedPerson,
  FriendsLikeItem,
  FriendsListenItem,
  FriendsMixItem,
} from "@/lib/dashboard/people-follows";
import { personProfileHref } from "@/lib/dashboard/people";
import {
  trackArtist,
  trackTitle,
  formatTrackDuration,
  type TrackRow,
} from "@/lib/tracks";

type Props = {
  artists: FollowedArtist[];
  tracks: FollowingFeedTrack[];
  people: FollowedPerson[];
  friendsListening: FriendsListenItem[];
  friendsLikes?: FriendsLikeItem[];
  friendsMixes?: FriendsMixItem[];
  loadError: string | null;
  missingTable: boolean;
  peopleMissingTable: boolean;
  /** True when privacy_show_followed_artists is off (default). */
  followedArtistsHidden?: boolean;
  /** True when privacy_show_followers is off (default). */
  followersHidden?: boolean;
  likedTracks?: Record<string, boolean>;
  likesReady?: boolean;
  followingPlaylists?: Record<string, boolean>;
  playlistFollowsReady?: boolean;
  playlistPreviewTracks?: Record<string, TrackRow>;
};

export function FollowingClient({
  artists: initialArtists,
  tracks: initialTracks,
  people: initialPeople,
  friendsListening: initialFriends,
  friendsLikes: initialLikes = [],
  friendsMixes: initialMixes = [],
  loadError,
  missingTable,
  peopleMissingTable,
  followedArtistsHidden = true,
  followersHidden = true,
  likedTracks = {},
  likesReady = false,
  followingPlaylists = {},
  playlistFollowsReady = false,
  playlistPreviewTracks = {},
}: Props) {
  const router = useRouter();
  const player = usePlayer();
  const [artists, setArtists] = useState(initialArtists);
  const [tracks, setTracks] = useState(initialTracks);
  const [people, setPeople] = useState(initialPeople);
  const [friends, setFriends] = useState(initialFriends);
  const [likes, setLikes] = useState(initialLikes);
  const [mixes, setMixes] = useState(initialMixes);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingPersonId, setPendingPersonId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setArtists(initialArtists);
    setTracks(initialTracks);
    setPeople(initialPeople);
    setFriends(initialFriends);
    setLikes(initialLikes);
    setMixes(initialMixes);
  }, [
    initialArtists,
    initialTracks,
    initialPeople,
    initialFriends,
    initialLikes,
    initialMixes,
  ]);

  const playableFresh = tracks.filter((t) => t.audio_url);
  const playableFriendsListening = friends.filter((t) => t.audio_url);
  const playableFriendsLikes = likes.filter((t) => t.audio_url);

  async function unfollow(artistId: string) {
    setPendingId(artistId);
    setError(null);
    const prevArtists = artists;
    const prevTracks = tracks;
    setArtists((list) => list.filter((a) => a.id !== artistId));
    setTracks((list) => list.filter((t) => t.artist_id !== artistId));
    try {
      const res = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist_id: artistId }),
      });
      const data = (await res.json()) as {
        error?: string;
        following?: boolean;
      };
      if (!res.ok || data.error) {
        setArtists(prevArtists);
        setTracks(prevTracks);
        setError(data.error || "Could not unfollow");
        return;
      }
      if (data.following) {
        setArtists(prevArtists);
        setTracks(prevTracks);
        setError("Could not unfollow — try again");
        return;
      }
      router.refresh();
    } catch (e) {
      setArtists(prevArtists);
      setTracks(prevTracks);
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPendingId(null);
    }
  }

  async function unfollowPerson(personId: string) {
    setPendingPersonId(personId);
    setError(null);
    const prevPeople = people;
    const prevFriends = friends;
    setPeople((list) => list.filter((p) => p.id !== personId));
    setFriends((list) => list.filter((f) => f.listener_id !== personId));
    try {
      const res = await fetch("/api/people/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person_id: personId }),
      });
      const data = (await res.json()) as {
        error?: string;
        following?: boolean;
      };
      if (!res.ok || data.error) {
        setPeople(prevPeople);
        setFriends(prevFriends);
        setError(data.error || "Could not unfollow");
        return;
      }
      if (data.following) {
        setPeople(prevPeople);
        setFriends(prevFriends);
        setError("Could not unfollow — try again");
        return;
      }
      router.refresh();
    } catch (e) {
      setPeople(prevPeople);
      setFriends(prevFriends);
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPendingPersonId(null);
    }
  }

  async function clearFollows() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    if (clearing) return;
    setClearing(true);
    setError(null);
    const prevArtists = artists;
    const prevTracks = tracks;
    setArtists([]);
    setTracks([]);
    try {
      const res = await fetch("/api/follows", { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setArtists(prevArtists);
        setTracks(prevTracks);
        setError(data.error || "Could not unfollow all");
        setConfirmClear(false);
        return;
      }
      setConfirmClear(false);
      router.refresh();
    } catch (e) {
      setArtists(prevArtists);
      setTracks(prevTracks);
      setError(e instanceof Error ? e.message : "Network error");
      setConfirmClear(false);
    } finally {
      setClearing(false);
    }
  }

  const emptyAll =
    !missingTable &&
    artists.length === 0 &&
    people.length === 0 &&
    !loadError;

  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/dashboard">
            <RectLogo size={34} showWordmark />
          </Link>
          <nav className="flex gap-4 text-sm text-white/55">
            <Link href="/dashboard" className="hover:text-white">
              Home
            </Link>
            <Link href="/search" className="hover:text-white">
              Search
            </Link>
            <Link href="/following" className="text-[#1DB954]">
              Following
            </Link>
            <Link href="/library" className="hover:text-white">
              Library
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-10 px-5 py-10 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
              Following
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
              Artists & people
            </h1>
            <p className="mt-2 text-sm text-white/45">
              Releases from artists you follow, plus friends’ shared listening.
            </p>
            {followedArtistsHidden ? (
              <p className="mt-4 max-w-xl rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/50">
                Artists you follow stay off your public page.{" "}
                <Link
                  href="/profile"
                  className="text-[#1DB954] hover:underline"
                >
                  Turn on Followed artists
                </Link>{" "}
                in Profile if you want friends to see them.
              </p>
            ) : (
              <p className="mt-2 text-sm text-white/40">
                Shared on your public page. Change anytime in{" "}
                <Link
                  href="/profile"
                  className="text-[#1DB954] hover:underline"
                >
                  Privacy settings
                </Link>
                .
              </p>
            )}
          </div>
          {!missingTable && artists.length > 0 ? (
            <button
              type="button"
              disabled={clearing}
              onClick={() => void clearFollows()}
              onBlur={() => {
                if (!clearing) setConfirmClear(false);
              }}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/45 hover:border-red-400/40 hover:text-red-300 disabled:opacity-50"
            >
              {clearing
                ? "Clearing…"
                : confirmClear
                  ? "Confirm unfollow all artists"
                  : "Unfollow all artists"}
            </button>
          ) : null}
        </div>

        {missingTable ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center">
            <p className="text-base font-medium">Follows not set up yet</p>
            <p className="mt-2 text-sm text-white/40">
              Run{" "}
              <code className="text-[#1DB954]">
                20260807_artist_follows.sql
              </code>{" "}
              in Supabase, then refresh.
            </p>
          </div>
        ) : null}

        {peopleMissingTable ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-8 text-center">
            <p className="text-sm text-white/50">
              People follows need{" "}
              <code className="text-[#1DB954]">
                20260809_people_follows.sql
              </code>{" "}
              in Supabase.
            </p>
          </div>
        ) : followersHidden && people.length === 0 ? (
          <p className="max-w-xl rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/50">
            Your Followers &amp; Following lists stay off your public page.{" "}
            <Link href="/profile" className="text-[#1DB954] hover:underline">
              Turn on Followers &amp; Following
            </Link>{" "}
            in Profile if you want others to see them.
          </p>
        ) : null}

        {loadError ? (
          <p
            className="rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-4 py-3 text-sm text-[#1DB954]"
            role="alert"
          >
            {loadError}
          </p>
        ) : null}

        {error ? (
          <p className="text-sm text-[#1DB954]" role="alert">
            {error}
          </p>
        ) : null}

        {emptyAll ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
            <p className="text-base font-medium">Nobody yet</p>
            <p className="mt-2 text-sm text-white/40">
              Follow artists on their portals, or people from Search.
            </p>
            <Link
              href="/search"
              className="mt-6 inline-block text-sm text-[#1DB954] hover:underline"
            >
              Find artists & people
            </Link>
          </div>
        ) : null}

        {people.length > 0 ? (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
              People
            </h2>
            {followersHidden ? (
              <p className="mb-3 max-w-xl rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/50">
                Your Followers &amp; Following lists stay off your public page.{" "}
                <Link
                  href="/profile"
                  className="text-[#1DB954] hover:underline"
                >
                  Turn on Followers &amp; Following
                </Link>{" "}
                in Profile if you want others to see them.
              </p>
            ) : null}
            <ul className="space-y-2">
              {people.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <Link
                    href={personProfileHref(p.id)}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
                      {p.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[0.65rem] font-semibold text-[#1DB954]/70">
                          {(p.display_name.trim().slice(0, 2) || "LI").toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium hover:text-[#1DB954]">
                        {p.display_name}
                      </span>
                      <span className="block truncate text-xs text-white/40">
                        {p.follows_viewer
                          ? "Friends"
                          : [
                              p.countries.slice(0, 2).join(" · "),
                              p.genres.slice(0, 2).join(" · "),
                            ]
                              .filter(Boolean)
                              .join(" · ") || "Listener"}
                      </span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void unfollowPerson(p.id)}
                    disabled={pendingPersonId === p.id}
                    className="shrink-0 rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 disabled:opacity-50"
                  >
                    {pendingPersonId === p.id ? "…" : "Unfollow"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {friends.length > 0 ? (
          <section>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
                Friends listening
              </h2>
              {playableFriendsListening.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      player.playQueue(playableFriendsListening, 0)
                    }
                    className="rounded-full bg-[#1DB954] px-3 py-1 text-xs font-semibold text-black hover:bg-[#17a349]"
                  >
                    ▶ Play all
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      player.playQueue(playableFriendsListening, 0, {
                        shuffle: true,
                        repeat: true,
                      })
                    }
                    className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
                  >
                    ⇄ Shuffle
                  </button>
                </>
              ) : null}
            </div>
            <ul className="space-y-1 rounded-2xl border border-white/10 bg-white/[0.03] p-2 md:p-3">
              {friends.map((t) => {
                const active = player.track?.id === t.id;
                const canPlay = Boolean(t.audio_url);
                const queueIdx = playableFriendsListening.findIndex(
                  (x) => x.id === t.id,
                );
                return (
                <li
                  key={`${t.listener_id}-${t.play_id}`}
                  className={`rounded-xl px-3 py-2.5 hover:bg-white/[0.06] ${
                    active ? "bg-[#1DB954]/10" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!canPlay) return;
                        if (active) player.toggle();
                        else
                          player.playQueue(
                            playableFriendsListening,
                            Math.max(0, queueIdx),
                          );
                      }}
                      disabled={!canPlay}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-40"
                    >
                      <TrackCover track={t} size="sm" href={`/songs/${t.id}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {trackTitle(t)}
                        </p>
                        <p className="truncate text-xs text-white/40">
                          {t.listener_name} · {trackArtist(t)}
                          {formatTrackDuration(t.duration_secs)
                            ? ` · ${formatTrackDuration(t.duration_secs)}`
                            : ""}
                        </p>
                      </div>
                    </button>
                    <Link
                      href={personProfileHref(t.listener_id)}
                      className="shrink-0 text-xs text-white/40 hover:text-[#1DB954]"
                    >
                      {t.listener_name.split(" ")[0]}
                    </Link>
                    <TrackLikeButton
                      trackId={t.id}
                      initialLiked={Boolean(likedTracks[t.id])}
                      likesReady={likesReady}
                      loginNext="/following"
                      compact
                    />
                    <QueueTrackButton track={t} compact />
                  </div>
                  <ActivityThanksButton
                    playId={t.play_id}
                    initialThanks={t.thanks_message}
                  />
                </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {likes.length > 0 ? (
          <section>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
                Friends liked
              </h2>
              {playableFriendsLikes.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => player.playQueue(playableFriendsLikes, 0)}
                    className="rounded-full bg-[#1DB954] px-3 py-1 text-xs font-semibold text-black hover:bg-[#17a349]"
                  >
                    ▶ Play all
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      player.playQueue(playableFriendsLikes, 0, {
                        shuffle: true,
                        repeat: true,
                      })
                    }
                    className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
                  >
                    ⇄ Shuffle
                  </button>
                </>
              ) : null}
            </div>
            <ul className="space-y-1 rounded-2xl border border-white/10 bg-white/[0.03] p-2 md:p-3">
              {likes.map((t) => {
                const active = player.track?.id === t.id;
                const canPlay = Boolean(t.audio_url);
                const queueIdx = playableFriendsLikes.findIndex(
                  (x) => x.id === t.id,
                );
                return (
                <li
                  key={t.like_id}
                  className={`rounded-xl px-3 py-2.5 hover:bg-white/[0.06] ${
                    active ? "bg-[#1DB954]/10" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!canPlay) return;
                        if (active) player.toggle();
                        else
                          player.playQueue(
                            playableFriendsLikes,
                            Math.max(0, queueIdx),
                          );
                      }}
                      disabled={!canPlay}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-40"
                    >
                      <TrackCover track={t} size="sm" href={`/songs/${t.id}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {trackTitle(t)}
                        </p>
                        <p className="truncate text-xs text-white/40">
                          {t.liker_name} · {trackArtist(t)}
                          {formatTrackDuration(t.duration_secs)
                            ? ` · ${formatTrackDuration(t.duration_secs)}`
                            : ""}
                        </p>
                      </div>
                    </button>
                    <Link
                      href={personProfileHref(t.liker_id)}
                      className="shrink-0 text-xs text-white/40 hover:text-[#1DB954]"
                    >
                      {t.liker_name.split(" ")[0]}
                    </Link>
                    <TrackLikeButton
                      trackId={t.id}
                      initialLiked={Boolean(likedTracks[t.id])}
                      likesReady={likesReady}
                      loginNext="/following"
                      compact
                    />
                    <QueueTrackButton track={t} compact />
                  </div>
                  <ActivityThanksButton
                    likerId={t.liker_id}
                    trackId={t.id}
                    initialThanks={t.thanks_message}
                  />
                </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {mixes.length > 0 ? (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
              Friends mixes
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {mixes.map((p) => (
                <li
                  key={p.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-[#1DB954]/40"
                >
                  <Link
                    href={`/playlists/${p.id}`}
                    className="flex items-center gap-3"
                  >
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
                      {p.cover_art_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.cover_art_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-white/25">
                          ♫
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {p.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-white/40">
                        {p.owner_name}
                        {p.description ? ` · ${p.description}` : ""}
                      </span>
                    </span>
                  </Link>
                  {playlistPreviewTracks[p.id] ? (
                    <InboxTrackPlay
                      track={playlistPreviewTracks[p.id]}
                      className="mt-2 rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
                    />
                  ) : null}
                  <InboxPlaylistActions
                    playlistId={p.id}
                    initialFollowing={Boolean(followingPlaylists[p.id])}
                    followsReady={playlistFollowsReady}
                    loginNext="/following"
                  />
                  <ActivityThanksButton
                    playlistId={p.id}
                    initialThanks={p.thanks_message}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {artists.length > 0 ? (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
              Artists
            </h2>
            <ul className="space-y-2">
              {artists.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <Link
                    href={`/artists/${a.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
                      {a.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[0.65rem] font-semibold text-[#1DB954]/70">
                          {(a.display_name.trim().slice(0, 2) || "AR").toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium hover:text-[#1DB954]">
                        {a.display_name}
                      </span>
                      <span className="block truncate text-xs text-white/40">
                        {[a.city, a.genres.slice(0, 2).join(" · ")]
                          .filter(Boolean)
                          .join(" · ") || "RECT SOUND artist"}
                      </span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void unfollow(a.id)}
                    disabled={pendingId === a.id}
                    className="shrink-0 rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 disabled:opacity-50"
                  >
                    {pendingId === a.id ? "…" : "Unfollow"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {tracks.length > 0 ? (
          <section>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
                Fresh from artists
              </h2>
              {playableFresh.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => player.playQueue(playableFresh, 0)}
                    className="rounded-full bg-[#1DB954] px-3 py-1 text-xs font-semibold text-black hover:bg-[#17a349]"
                  >
                    ▶ Play all
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      player.playQueue(playableFresh, 0, {
                        shuffle: true,
                        repeat: true,
                      })
                    }
                    className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
                  >
                    ⇄ Shuffle
                  </button>
                </>
              ) : null}
            </div>
            <ul className="space-y-1 rounded-2xl border border-white/10 bg-white/[0.03] p-2 md:p-3">
              {tracks.map((t) => {
                const active = player.track?.id === t.id;
                const canPlay = Boolean(t.audio_url);
                const queueIdx = playableFresh.findIndex((x) => x.id === t.id);
                return (
                <li
                  key={t.id}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-white/[0.06] ${
                    active ? "bg-[#1DB954]/10" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (!canPlay) return;
                      if (active) player.toggle();
                      else
                        player.playQueue(playableFresh, Math.max(0, queueIdx));
                    }}
                    disabled={!canPlay}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-40"
                  >
                    <TrackCover track={t} size="sm" href={`/songs/${t.id}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {trackTitle(t)}
                      </p>
                      <p className="truncate text-xs text-white/40">
                        {trackArtist(t)}
                        {formatTrackDuration(t.duration_secs)
                          ? ` · ${formatTrackDuration(t.duration_secs)}`
                          : ""}
                      </p>
                    </div>
                  </button>
                  <AddToPlaylist
                    trackId={t.id}
                    compact
                    loginNext="/following"
                  />
                  <TrackLikeButton
                    trackId={t.id}
                    initialLiked={Boolean(likedTracks[t.id])}
                    likesReady={likesReady}
                    loginNext="/following"
                    compact
                  />
                  <QueueTrackButton track={t} compact />
                  <ShareTrackButton track={t} compact />
                </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
