"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { InboxCommentReply } from "@/components/inbox-comment-reply";
import { InboxPlaylistActions } from "@/components/inbox-playlist-actions";
import { InboxReleaseActions } from "@/components/inbox-release-actions";
import { InboxTrackPlay } from "@/components/inbox-track-play";
import { PeopleFollowButton } from "@/components/people-follow-button";
import { PlaylistCollabInviteActions } from "@/components/playlist-collab-invite-actions";
import { PlaylistCollabRequestActions } from "@/components/playlist-collab-request-actions";
import { ActivityThanksButton } from "@/components/activity-thanks-button";
import { RectLogo } from "@/components/rect-logo";
import { ShareThanksButton } from "@/components/share-thanks-button";
import { TipThanksButton } from "@/components/tip-thanks-button";
import {
  formatNotificationTime,
  type ArtistNotification,
} from "@/lib/dashboard/notifications";
import { personProfileHref } from "@/lib/dashboard/people";
import type { TrackRow } from "@/lib/tracks";

function trackLabel(n: ArtistNotification, fallback: string) {
  return n.track_title || fallback;
}

function playlistLabel(n: ArtistNotification, fallback: string) {
  return n.playlist_name || fallback;
}

type Props = {
  notifications: ArtistNotification[];
  unreadCount: number;
  loadError: string | null;
  missingTable: boolean;
  title?: string;
  subtitle?: string;
  homeHref?: string;
  homeLabel?: string;
  emptyHint?: string;
  /** Actor ids the viewer already follows (people_follow rows). */
  followingActors?: Record<string, boolean>;
  peopleFollowsReady?: boolean;
  /** Artist ids the viewer already follows (artist_follows). */
  followingArtists?: Record<string, boolean>;
  artistFollowsReady?: boolean;
  /** Track ids the viewer already liked. */
  likedTracks?: Record<string, boolean>;
  likesReady?: boolean;
  /** Release / share tracks keyed by id (for Play). */
  releaseTracks?: Record<string, TrackRow>;
  /** First track per playlist id (playlist_share / friend_mix Play preview). */
  playlistPreviewTracks?: Record<string, TrackRow>;
  /** Playlist ids the viewer already follows. */
  followingPlaylists?: Record<string, boolean>;
  playlistFollowsReady?: boolean;
  /** Thanks already sent on friend_mix playlist ids. */
  mixThanksByPlaylist?: Record<string, string>;
  /** Thanks already sent on listen play ids. */
  playThanksByPlay?: Record<string, string>;
  /** Thanks already sent on like pairs (`likerId:trackId`). */
  likeThanksByPair?: Record<string, string>;
  /** Thanks already sent on comment ids. */
  commentThanksById?: Record<number, string>;
  /** Thanks already sent on playlist comment ids. */
  playlistCommentThanksById?: Record<number, string>;
};

export function ArtistInboxClient({
  notifications: initial,
  unreadCount: initialUnread,
  loadError,
  missingTable,
  title = "Activity",
  subtitle = "Follows, likes, and tips",
  homeHref = "/artist",
  homeLabel = "Studio",
  emptyHint = "New follows and tips will show up here.",
  followingActors = {},
  peopleFollowsReady = false,
  followingArtists = {},
  artistFollowsReady = false,
  likedTracks = {},
  likesReady = false,
  releaseTracks = {},
  playlistPreviewTracks = {},
  followingPlaylists = {},
  playlistFollowsReady = false,
  mixThanksByPlaylist = {},
  playThanksByPlay = {},
  likeThanksByPair = {},
  commentThanksById = {},
  playlistCommentThanksById = {},
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [unread, setUnread] = useState(initialUnread);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const followBackNext =
    homeHref === "/artist" ? "/artist/inbox" : "/inbox";

  function followBack(actorId: string | null | undefined) {
    if (!actorId || !peopleFollowsReady) return null;
    return (
      <PeopleFollowButton
        personId={actorId}
        initialFollowing={Boolean(followingActors[actorId])}
        initialCount={0}
        followsReady={peopleFollowsReady}
        showCount={false}
        followsYou
        idleLabel="Follow back"
        compact
        className="mt-2"
        loginNext={followBackNext}
      />
    );
  }

  useEffect(() => {
    setItems(initial);
    setUnread(initialUnread);
  }, [initial, initialUnread]);

  async function markAllRead() {
    if (pending || unread === 0) return;
    const unreadIds = items.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setPending(true);
    setError(null);
    const prev = items;
    setItems((list) =>
      list.map((n) => ({
        ...n,
        read_at: n.read_at ?? new Date().toISOString(),
      })),
    );
    setUnread(0);
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: unreadIds }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setItems(prev);
        setUnread(initialUnread);
        setError(data.error || "Could not mark read");
        return;
      }
      router.refresh();
    } catch (e) {
      setItems(prev);
      setUnread(initialUnread);
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4 sm:px-6">
          <Link href={homeHref}>
            <RectLogo size={34} showWordmark />
          </Link>
          <nav className="flex gap-4 text-sm text-white/55">
            <Link href={homeHref} className="hover:text-white">
              {homeLabel}
            </Link>
            <Link href="/following" className="hover:text-white">
              Following
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl space-y-8 px-5 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
              Inbox
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight">
              {title}
            </h1>
            <p className="mt-2 text-sm text-white/45">
              {subtitle} · {unread} unread
            </p>
          </div>
          {unread > 0 && !missingTable ? (
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={pending}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/70 hover:bg-white/10 disabled:opacity-50"
            >
              {pending ? "…" : "Mark all read"}
            </button>
          ) : null}
        </div>

        {missingTable ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center">
            <p className="text-base font-medium">Inbox not set up yet</p>
            <p className="mt-2 text-sm text-white/40">
              Run notifications SQL in Supabase, then refresh.
            </p>
          </div>
        ) : null}

        {loadError || error ? (
          <p className="text-sm text-[#1DB954]" role="alert">
            {error || loadError}
          </p>
        ) : null}

        {!missingTable && items.length === 0 && !loadError ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
            <p className="text-base font-medium">No activity yet</p>
            <p className="mt-2 text-sm text-white/40">{emptyHint}</p>
          </div>
        ) : null}

        {items.length > 0 ? (
          <ul className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
            {items.map((n) => (
              <li
                key={n.id}
                className={`border-b border-white/[0.06] px-4 py-4 last:border-b-0 ${
                  n.read_at ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {!n.read_at ? (
                        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#1DB954]" />
                      ) : null}
                      {n.kind === "tip" ? (
                        <>
                          <span className="text-[#1DB954]">
                            Demo {n.amount_xof?.toLocaleString() ?? "?"} XOF
                          </span>{" "}
                          tip from{" "}
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}
                          {n.track_id ? (
                            <>
                              {" "}
                              on{" "}
                              <Link
                                href={`/songs/${n.track_id}`}
                                className="text-[#1DB954] hover:underline"
                              >
                                {trackLabel(n, "your track")}
                              </Link>
                            </>
                          ) : null}
                          {n.body ? (
                            <span className="mt-1 block text-white/55">
                              “{n.body}”
                            </span>
                          ) : null}
                          {n.track_id ? (
                            <InboxTrackPlay
                              track={releaseTracks[n.track_id] ?? null}
                            />
                          ) : null}
                          {n.tip_id != null ? (
                            <TipThanksButton
                              tipId={n.tip_id}
                              initialThanks={n.tip_thanks_message}
                            />
                          ) : null}
                          {followBack(n.actor_id)}
                        </>
                      ) : n.kind === "release" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          released{" "}
                          {n.track_id ? (
                            <Link
                              href={`/songs/${n.track_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              {n.body || "a new track"}
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">
                              {n.body || "a new track"}
                            </span>
                          )}
                          {n.track_id ? (
                            <InboxReleaseActions
                              trackId={n.track_id}
                              track={releaseTracks[n.track_id] ?? null}
                              artistId={n.actor_id}
                              initialLiked={Boolean(likedTracks[n.track_id])}
                              likesReady={likesReady}
                              initialFollowing={Boolean(
                                n.actor_id && followingArtists[n.actor_id],
                              )}
                              followsReady={artistFollowsReady}
                              loginNext={followBackNext}
                            />
                          ) : null}
                        </>
                      ) : n.kind === "like" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          liked{" "}
                          {n.track_id ? (
                            <Link
                              href={`/songs/${n.track_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              {n.track_title || n.body || "your track"}
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">
                              {n.track_title || n.body || "your track"}
                            </span>
                          )}
                          {n.track_id ? (
                            <InboxTrackPlay
                              track={releaseTracks[n.track_id] ?? null}
                            />
                          ) : null}
                          {followBack(n.actor_id)}
                          {n.actor_id && n.track_id ? (
                            <ActivityThanksButton
                              likerId={n.actor_id}
                              trackId={n.track_id}
                              initialThanks={
                                likeThanksByPair[
                                  `${n.actor_id}:${n.track_id}`
                                ] ?? null
                              }
                            />
                          ) : null}
                        </>
                      ) : n.kind === "listen" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          listened to{" "}
                          {n.track_id ? (
                            <Link
                              href={`/songs/${n.track_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              {n.track_title || n.body || "your track"}
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">
                              {n.track_title || n.body || "your track"}
                            </span>
                          )}
                          {n.track_id ? (
                            <InboxTrackPlay
                              track={releaseTracks[n.track_id] ?? null}
                            />
                          ) : null}
                          {followBack(n.actor_id)}
                          {n.play_id ? (
                            <ActivityThanksButton
                              playId={n.play_id}
                              initialThanks={
                                playThanksByPlay[n.play_id] ?? null
                              }
                            />
                          ) : null}
                        </>
                      ) : n.kind === "comment" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          commented on{" "}
                          {n.track_id ? (
                            <Link
                              href={`/songs/${n.track_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              {trackLabel(n, "your track")}
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">
                              {trackLabel(n, "your track")}
                            </span>
                          )}
                          {n.body ? (
                            <span className="mt-1 block text-white/55">
                              “{n.body}”
                            </span>
                          ) : null}
                          {n.track_id ? (
                            <InboxTrackPlay
                              track={releaseTracks[n.track_id] ?? null}
                            />
                          ) : null}
                          {followBack(n.actor_id)}
                          {n.track_id && n.comment_id != null ? (
                            <InboxCommentReply
                              target="track"
                              entityId={n.track_id}
                              parentCommentId={n.comment_id}
                              loginNext={followBackNext}
                            />
                          ) : null}
                          {n.comment_id != null ? (
                            <ActivityThanksButton
                              commentId={n.comment_id}
                              initialThanks={
                                commentThanksById[n.comment_id] ?? null
                              }
                            />
                          ) : null}
                        </>
                      ) : n.kind === "people_follow" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          started following you
                          {followBack(n.actor_id)}
                          <ShareThanksButton
                            notificationId={n.id}
                            initialThanks={n.share_thanks_message}
                            endpoint="/api/people/follows/thanks"
                          />
                        </>
                      ) : n.kind === "playlist_follow" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          saved{" "}
                          {n.playlist_id ? (
                            <Link
                              href={`/playlists/${n.playlist_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              {n.body || "your playlist"}
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">
                              {n.body || "your playlist"}
                            </span>
                          )}
                          {followBack(n.actor_id)}
                          <ShareThanksButton
                            notificationId={n.id}
                            initialThanks={n.share_thanks_message}
                            endpoint="/api/playlist-follows/thanks"
                          />
                        </>
                      ) : n.kind === "playlist_copy" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          made a copy of{" "}
                          {n.playlist_id ? (
                            <Link
                              href={`/playlists/${n.playlist_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              {n.body || "your mix"}
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">
                              {n.body || "your mix"}
                            </span>
                          )}
                          {n.related_playlist_id ? (
                            <span className="mt-2 flex flex-wrap items-center gap-2">
                              <Link
                                href={`/playlists/${n.related_playlist_id}`}
                                className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
                              >
                                Open their copy
                              </Link>
                              {playlistPreviewTracks[n.related_playlist_id] ? (
                                <InboxTrackPlay
                                  track={
                                    playlistPreviewTracks[n.related_playlist_id]
                                  }
                                />
                              ) : null}
                            </span>
                          ) : null}
                          {followBack(n.actor_id)}
                          <ShareThanksButton
                            notificationId={n.id}
                            initialThanks={n.share_thanks_message}
                            endpoint="/api/playlists/copy/thanks"
                          />
                        </>
                      ) : n.kind === "friend_mix" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          shared a mix
                          {n.playlist_id ? (
                            <>
                              :{" "}
                              <Link
                                href={`/playlists/${n.playlist_id}`}
                                className="text-[#1DB954] hover:underline"
                              >
                                {n.body || "Open mix"}
                              </Link>
                            </>
                          ) : n.body ? (
                            <span className="text-[#1DB954]">: {n.body}</span>
                          ) : null}
                          {n.playlist_id &&
                          playlistPreviewTracks[n.playlist_id] ? (
                            <InboxTrackPlay
                              track={playlistPreviewTracks[n.playlist_id]}
                            />
                          ) : null}
                          {n.playlist_id ? (
                            <InboxPlaylistActions
                              playlistId={n.playlist_id}
                              initialFollowing={Boolean(
                                followingPlaylists[n.playlist_id],
                              )}
                              followsReady={playlistFollowsReady}
                              loginNext={followBackNext}
                            />
                          ) : null}
                          {followBack(n.actor_id)}
                          {n.playlist_id ? (
                            <ActivityThanksButton
                              playlistId={n.playlist_id}
                              initialThanks={
                                mixThanksByPlaylist[n.playlist_id] ?? null
                              }
                            />
                          ) : null}
                        </>
                      ) : n.kind === "track_share" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          sent you{" "}
                          {n.track_id ? (
                            <Link
                              href={`/songs/${n.track_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              {trackLabel(n, "a track")}
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">a track</span>
                          )}
                          {n.body ? (
                            <span className="mt-1 block text-white/55">
                              “{n.body}”
                            </span>
                          ) : null}
                          {n.track_id ? (
                            <InboxReleaseActions
                              trackId={n.track_id}
                              track={releaseTracks[n.track_id] ?? null}
                              artistId={
                                releaseTracks[n.track_id]?.artist_id ?? null
                              }
                              initialLiked={Boolean(likedTracks[n.track_id])}
                              likesReady={likesReady}
                              initialFollowing={Boolean(
                                releaseTracks[n.track_id]?.artist_id &&
                                  followingArtists[
                                    releaseTracks[n.track_id]!.artist_id!
                                  ],
                              )}
                              followsReady={artistFollowsReady}
                              loginNext={followBackNext}
                            />
                          ) : null}
                          {followBack(n.actor_id)}
                          <ShareThanksButton
                            notificationId={n.id}
                            initialThanks={n.share_thanks_message}
                          />
                        </>
                      ) : n.kind === "playlist_share" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          sent you{" "}
                          {n.playlist_id ? (
                            <Link
                              href={`/playlists/${n.playlist_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              {playlistLabel(n, "a playlist")}
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">a playlist</span>
                          )}
                          {n.body ? (
                            <span className="mt-1 block text-white/55">
                              “{n.body}”
                            </span>
                          ) : null}
                          {n.playlist_id &&
                          playlistPreviewTracks[n.playlist_id] ? (
                            <InboxTrackPlay
                              track={playlistPreviewTracks[n.playlist_id]}
                            />
                          ) : null}
                          {n.playlist_id ? (
                            <InboxPlaylistActions
                              playlistId={n.playlist_id}
                              initialFollowing={Boolean(
                                followingPlaylists[n.playlist_id],
                              )}
                              followsReady={playlistFollowsReady}
                              loginNext={followBackNext}
                            />
                          ) : null}
                          {followBack(n.actor_id)}
                          <ShareThanksButton
                            notificationId={n.id}
                            initialThanks={n.share_thanks_message}
                          />
                        </>
                      ) : n.kind === "share_thanks" ||
                        n.kind === "playlist_follow_thanks" ||
                        n.kind === "playlist_copy_thanks" ||
                        n.kind === "people_follow_thanks" ||
                        n.kind === "follow_thanks" ||
                        n.kind === "comment_like_thanks" ||
                        n.kind === "playlist_comment_like_thanks" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          {n.kind === "playlist_follow_thanks"
                            ? "thanked you for saving"
                            : n.kind === "playlist_copy_thanks"
                              ? "thanked you for copying"
                              : n.kind === "people_follow_thanks" ||
                                  n.kind === "follow_thanks"
                                ? "thanked you for following"
                                : n.kind === "comment_like_thanks" ||
                                    n.kind === "playlist_comment_like_thanks"
                                  ? "thanked you for liking their comment"
                                  : "thanked you for sharing"}
                          {n.track_id ? (
                            <>
                              {" "}
                              <Link
                                href={`/songs/${n.track_id}`}
                                className="text-[#1DB954] hover:underline"
                              >
                                {trackLabel(n, "a track")}
                              </Link>
                            </>
                          ) : n.playlist_id ? (
                            <>
                              {" "}
                              <Link
                                href={`/playlists/${n.playlist_id}`}
                                className="text-[#1DB954] hover:underline"
                              >
                                {playlistLabel(n, "a mix")}
                              </Link>
                            </>
                          ) : null}
                          {n.body ? (
                            <span className="mt-1 block text-white/55">
                              “{n.body}”
                            </span>
                          ) : null}
                          {n.track_id ? (
                            <InboxTrackPlay
                              track={releaseTracks[n.track_id] ?? null}
                            />
                          ) : null}
                          {n.playlist_id ? (
                            <InboxPlaylistActions
                              playlistId={n.playlist_id}
                              initialFollowing={Boolean(
                                followingPlaylists[n.playlist_id],
                              )}
                              followsReady={playlistFollowsReady}
                              loginNext={followBackNext}
                            />
                          ) : null}
                        </>
                      ) : n.kind === "activity_thanks" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          reacted to your listen
                          {n.track_id ? (
                            <>
                              {" "}
                              of{" "}
                              <Link
                                href={`/songs/${n.track_id}`}
                                className="text-[#1DB954] hover:underline"
                              >
                                {trackLabel(n, "a track")}
                              </Link>
                            </>
                          ) : null}
                          {n.body ? (
                            <span className="mt-1 block text-white/55">
                              “{n.body}”
                            </span>
                          ) : null}
                          {n.track_id ? (
                            <InboxTrackPlay
                              track={releaseTracks[n.track_id] ?? null}
                            />
                          ) : null}
                        </>
                      ) : n.kind === "like_thanks" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          reacted to your like
                          {n.track_id ? (
                            <>
                              {" "}
                              of{" "}
                              <Link
                                href={`/songs/${n.track_id}`}
                                className="text-[#1DB954] hover:underline"
                              >
                                {trackLabel(n, "a track")}
                              </Link>
                            </>
                          ) : null}
                          {n.body ? (
                            <span className="mt-1 block text-white/55">
                              “{n.body}”
                            </span>
                          ) : null}
                          {n.track_id ? (
                            <InboxTrackPlay
                              track={releaseTracks[n.track_id] ?? null}
                            />
                          ) : null}
                        </>
                      ) : n.kind === "comment_thanks" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          thanked you for your comment
                          {n.track_id ? (
                            <>
                              {" "}
                              on{" "}
                              <Link
                                href={`/songs/${n.track_id}`}
                                className="text-[#1DB954] hover:underline"
                              >
                                {trackLabel(n, "a track")}
                              </Link>
                            </>
                          ) : null}
                          {n.body ? (
                            <span className="mt-1 block text-white/55">
                              “{n.body}”
                            </span>
                          ) : null}
                          {n.track_id ? (
                            <InboxTrackPlay
                              track={releaseTracks[n.track_id] ?? null}
                            />
                          ) : null}
                        </>
                      ) : n.kind === "playlist_comment_thanks" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          thanked you for your mix comment
                          {n.playlist_id ? (
                            <>
                              {" "}
                              on{" "}
                              <Link
                                href={`/playlists/${n.playlist_id}`}
                                className="text-[#1DB954] hover:underline"
                              >
                                {playlistLabel(n, "a mix")}
                              </Link>
                            </>
                          ) : null}
                          {n.body ? (
                            <span className="mt-1 block text-white/55">
                              “{n.body}”
                            </span>
                          ) : null}
                          {n.playlist_id ? (
                            <InboxPlaylistActions
                              playlistId={n.playlist_id}
                              initialFollowing={Boolean(
                                followingPlaylists[n.playlist_id],
                              )}
                              followsReady={playlistFollowsReady}
                              loginNext={followBackNext}
                            />
                          ) : null}
                          {followBack(n.actor_id)}
                        </>
                      ) : n.kind === "mix_thanks" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          reacted to your mix
                          {n.playlist_id ? (
                            <>
                              {" "}
                              <Link
                                href={`/playlists/${n.playlist_id}`}
                                className="text-[#1DB954] hover:underline"
                              >
                                {playlistLabel(n, "Open mix")}
                              </Link>
                            </>
                          ) : null}
                          {n.body ? (
                            <span className="mt-1 block text-white/55">
                              “{n.body}”
                            </span>
                          ) : null}
                          {n.playlist_id ? (
                            <InboxPlaylistActions
                              playlistId={n.playlist_id}
                              initialFollowing={Boolean(
                                followingPlaylists[n.playlist_id],
                              )}
                              followsReady={playlistFollowsReady}
                              loginNext={followBackNext}
                            />
                          ) : null}
                          {followBack(n.actor_id)}
                        </>
                      ) : n.kind === "comment_reply" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          replied on{" "}
                          {n.track_id ? (
                            <Link
                              href={`/songs/${n.track_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              {trackLabel(n, "a track")}
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">
                              {trackLabel(n, "a track")}
                            </span>
                          )}
                          {n.body ? (
                            <span className="mt-1 block text-white/55">
                              “{n.body}”
                            </span>
                          ) : null}
                          {n.track_id ? (
                            <InboxTrackPlay
                              track={releaseTracks[n.track_id] ?? null}
                            />
                          ) : null}
                          {followBack(n.actor_id)}
                          {n.track_id && n.comment_id != null ? (
                            <InboxCommentReply
                              target="track"
                              entityId={n.track_id}
                              parentCommentId={n.comment_id}
                              loginNext={followBackNext}
                            />
                          ) : null}
                          {n.comment_id != null ? (
                            <ActivityThanksButton
                              commentId={n.comment_id}
                              initialThanks={
                                commentThanksById[n.comment_id] ?? null
                              }
                            />
                          ) : null}
                        </>
                      ) : n.kind === "tip_thanks" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          thanked you for your{" "}
                          <span className="text-[#1DB954]">
                            {n.amount_xof?.toLocaleString() ?? "?"} XOF
                          </span>{" "}
                          tip
                          {n.track_id ? (
                            <>
                              {" "}
                              on{" "}
                              <Link
                                href={`/songs/${n.track_id}`}
                                className="text-[#1DB954] hover:underline"
                              >
                                {trackLabel(n, "your track")}
                              </Link>
                            </>
                          ) : null}
                          {n.body ? (
                            <span className="mt-1 block text-white/55">
                              “{n.body}”
                            </span>
                          ) : null}
                          {n.track_id ? (
                            <InboxTrackPlay
                              track={releaseTracks[n.track_id] ?? null}
                            />
                          ) : null}
                        </>
                      ) : n.kind === "playlist_collab_invite" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          invited you to collaborate on{" "}
                          {n.playlist_id ? (
                            <Link
                              href={`/playlists/${n.playlist_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              {n.body || "a playlist"}
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">
                              {n.body || "a playlist"}
                            </span>
                          )}
                          {n.playlist_id ? (
                            <PlaylistCollabInviteActions
                              playlistId={n.playlist_id}
                            />
                          ) : null}
                        </>
                      ) : n.kind === "playlist_collab_request" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          asked to collab on{" "}
                          {n.playlist_id ? (
                            <Link
                              href={`/playlists/${n.playlist_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              {n.body || "your mix"}
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">
                              {n.body || "your mix"}
                            </span>
                          )}
                          {n.playlist_id && n.actor_id ? (
                            <PlaylistCollabRequestActions
                              playlistId={n.playlist_id}
                              personId={n.actor_id}
                              notificationId={n.id}
                            />
                          ) : null}
                          {followBack(n.actor_id)}
                        </>
                      ) : n.kind === "playlist_collab_accepted" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          confirmed collab on{" "}
                          {n.playlist_id ? (
                            <Link
                              href={`/playlists/${n.playlist_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              {n.body || "a playlist"}
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">
                              {n.body || "a playlist"}
                            </span>
                          )}
                        </>
                      ) : n.kind === "playlist_collab_declined" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          declined collab on{" "}
                          {n.playlist_id ? (
                            <Link
                              href={`/playlists/${n.playlist_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              {n.body || "a mix"}
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">
                              {n.body || "a mix"}
                            </span>
                          )}
                        </>
                      ) : n.kind === "playlist_collab_left" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          left{" "}
                          {n.playlist_id ? (
                            <Link
                              href={`/playlists/${n.playlist_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              {n.body || "your mix"}
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">
                              {n.body || "your mix"}
                            </span>
                          )}
                        </>
                      ) : n.kind === "playlist_collab_removed" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          removed you from{" "}
                          {n.playlist_id ? (
                            <Link
                              href={`/playlists/${n.playlist_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              {n.body || "a mix"}
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">
                              {n.body || "a mix"}
                            </span>
                          )}
                        </>
                      ) : n.kind === "playlist_collab_add" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          added{" "}
                          {n.track_id ? (
                            <Link
                              href={`/songs/${n.track_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              {n.body?.split(" · ")[0] || "a track"}
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">
                              {n.body?.split(" · ")[0] || "a track"}
                            </span>
                          )}{" "}
                          to{" "}
                          {n.playlist_id ? (
                            <Link
                              href={`/playlists/${n.playlist_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              {n.body?.includes(" · ")
                                ? n.body.split(" · ").slice(1).join(" · ")
                                : "your playlist"}
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">
                              your playlist
                            </span>
                          )}
                          {n.track_id ? (
                            <InboxReleaseActions
                              trackId={n.track_id}
                              track={releaseTracks[n.track_id] ?? null}
                              artistId={
                                releaseTracks[n.track_id]?.artist_id ?? null
                              }
                              initialLiked={Boolean(likedTracks[n.track_id])}
                              likesReady={likesReady}
                              initialFollowing={Boolean(
                                releaseTracks[n.track_id]?.artist_id &&
                                  followingArtists[
                                    releaseTracks[n.track_id]!.artist_id!
                                  ],
                              )}
                              followsReady={artistFollowsReady}
                              loginNext={followBackNext}
                            />
                          ) : null}
                          {followBack(n.actor_id)}
                        </>
                      ) : n.kind === "comment_like" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          liked your comment
                          {n.track_id ? (
                            <>
                              {" "}
                              on{" "}
                              <Link
                                href={`/songs/${n.track_id}`}
                                className="text-[#1DB954] hover:underline"
                              >
                                {trackLabel(n, "a track")}
                              </Link>
                            </>
                          ) : null}
                          {n.body ? (
                            <span className="mt-1 block text-white/55">
                              “{n.body}”
                            </span>
                          ) : null}
                          {n.track_id ? (
                            <InboxReleaseActions
                              trackId={n.track_id}
                              track={releaseTracks[n.track_id] ?? null}
                              artistId={
                                releaseTracks[n.track_id]?.artist_id ?? null
                              }
                              initialLiked={Boolean(likedTracks[n.track_id])}
                              likesReady={likesReady}
                              initialFollowing={Boolean(
                                releaseTracks[n.track_id]?.artist_id &&
                                  followingArtists[
                                    releaseTracks[n.track_id]!.artist_id!
                                  ],
                              )}
                              followsReady={artistFollowsReady}
                              loginNext={followBackNext}
                            />
                          ) : null}
                          {followBack(n.actor_id)}
                          {n.track_id && n.comment_id != null ? (
                            <InboxCommentReply
                              target="track"
                              entityId={n.track_id}
                              parentCommentId={n.comment_id}
                              loginNext={followBackNext}
                            />
                          ) : null}
                          <ShareThanksButton
                            notificationId={n.id}
                            initialThanks={n.share_thanks_message}
                            endpoint="/api/comments/like/thanks"
                          />
                        </>
                      ) : n.kind === "playlist_track_add" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          added{" "}
                          {n.track_id ? (
                            <Link
                              href={`/songs/${n.track_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              {n.body?.split(" · ")[0] || "a track"}
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">
                              {n.body?.split(" · ")[0] || "a track"}
                            </span>
                          )}{" "}
                          to{" "}
                          {n.playlist_id ? (
                            <Link
                              href={`/playlists/${n.playlist_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              {n.body?.includes(" · ")
                                ? n.body.split(" · ").slice(1).join(" · ")
                                : "a saved playlist"}
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">
                              a saved playlist
                            </span>
                          )}
                          {n.track_id ? (
                            <InboxReleaseActions
                              trackId={n.track_id}
                              track={releaseTracks[n.track_id] ?? null}
                              artistId={
                                releaseTracks[n.track_id]?.artist_id ?? null
                              }
                              initialLiked={Boolean(likedTracks[n.track_id])}
                              likesReady={likesReady}
                              initialFollowing={Boolean(
                                releaseTracks[n.track_id]?.artist_id &&
                                  followingArtists[
                                    releaseTracks[n.track_id]!.artist_id!
                                  ],
                              )}
                              followsReady={artistFollowsReady}
                              loginNext={followBackNext}
                            />
                          ) : null}
                          {followBack(n.actor_id)}
                        </>
                      ) : n.kind === "playlist_comment" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          commented on{" "}
                          {n.playlist_id ? (
                            <Link
                              href={`/playlists/${n.playlist_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              your mix
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">your mix</span>
                          )}
                          {n.body ? (
                            <span className="mt-1 block text-white/55">
                              “{n.body}”
                            </span>
                          ) : null}
                          {n.playlist_id &&
                          playlistPreviewTracks[n.playlist_id] ? (
                            <InboxTrackPlay
                              track={playlistPreviewTracks[n.playlist_id]}
                            />
                          ) : null}
                          {followBack(n.actor_id)}
                          {n.playlist_id && n.playlist_comment_id != null ? (
                            <InboxCommentReply
                              target="playlist"
                              entityId={n.playlist_id}
                              parentCommentId={n.playlist_comment_id}
                              loginNext={followBackNext}
                            />
                          ) : null}
                          {n.playlist_comment_id != null ? (
                            <ActivityThanksButton
                              playlistCommentId={n.playlist_comment_id}
                              initialThanks={
                                playlistCommentThanksById[
                                  n.playlist_comment_id
                                ] ?? null
                              }
                            />
                          ) : null}
                        </>
                      ) : n.kind === "playlist_comment_reply" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          replied on{" "}
                          {n.playlist_id ? (
                            <Link
                              href={`/playlists/${n.playlist_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              a playlist
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">a playlist</span>
                          )}
                          {n.body ? (
                            <span className="mt-1 block text-white/55">
                              “{n.body}”
                            </span>
                          ) : null}
                          {n.playlist_id &&
                          playlistPreviewTracks[n.playlist_id] ? (
                            <InboxTrackPlay
                              track={playlistPreviewTracks[n.playlist_id]}
                            />
                          ) : null}
                          {followBack(n.actor_id)}
                          {n.playlist_id && n.playlist_comment_id != null ? (
                            <InboxCommentReply
                              target="playlist"
                              entityId={n.playlist_id}
                              parentCommentId={n.playlist_comment_id}
                              loginNext={followBackNext}
                            />
                          ) : null}
                          {n.playlist_comment_id != null ? (
                            <ActivityThanksButton
                              playlistCommentId={n.playlist_comment_id}
                              initialThanks={
                                playlistCommentThanksById[
                                  n.playlist_comment_id
                                ] ?? null
                              }
                            />
                          ) : null}
                        </>
                      ) : n.kind === "playlist_comment_like" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          liked your playlist comment
                          {n.playlist_id ? (
                            <>
                              {" "}
                              on{" "}
                              <Link
                                href={`/playlists/${n.playlist_id}`}
                                className="text-[#1DB954] hover:underline"
                              >
                                a mix
                              </Link>
                            </>
                          ) : null}
                          {n.body ? (
                            <span className="mt-1 block text-white/55">
                              “{n.body}”
                            </span>
                          ) : null}
                          {n.playlist_id &&
                          playlistPreviewTracks[n.playlist_id] ? (
                            <InboxTrackPlay
                              track={playlistPreviewTracks[n.playlist_id]}
                            />
                          ) : null}
                          {followBack(n.actor_id)}
                          {n.playlist_id && n.playlist_comment_id != null ? (
                            <InboxCommentReply
                              target="playlist"
                              entityId={n.playlist_id}
                              parentCommentId={n.playlist_comment_id}
                              loginNext={followBackNext}
                            />
                          ) : null}
                          <ShareThanksButton
                            notificationId={n.id}
                            initialThanks={n.share_thanks_message}
                            endpoint="/api/comments/like/thanks"
                          />
                        </>
                      ) : n.kind === "follow" ? (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          followed you
                          {followBack(n.actor_id)}
                          <ShareThanksButton
                            notificationId={n.id}
                            initialThanks={n.share_thanks_message}
                            endpoint="/api/follows/thanks"
                          />
                        </>
                      ) : (
                        <>
                          {n.actor_id ? (
                            <Link
                              href={personProfileHref(n.actor_id)}
                              className="hover:text-[#1DB954] hover:underline"
                            >
                              {n.actor_name}
                            </Link>
                          ) : (
                            n.actor_name
                          )}{" "}
                          followed you
                          {followBack(n.actor_id)}
                        </>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-white/40">
                      {formatNotificationTime(n.created_at)}
                      {n.kind === "tip" ? " · demo" : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-[0.65rem] uppercase tracking-[0.12em] text-white/30">
                    {n.kind}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
