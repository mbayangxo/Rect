import { redirect } from "next/navigation";
import { ArtistInboxClient } from "@/app/artist/inbox/inbox-client";
import { loadMyCommentThanksMap } from "@/lib/dashboard/comment-thanks";
import { loadFollowingAmongArtists } from "@/lib/dashboard/follows";
import { loadLikedAmongTrackIds } from "@/lib/dashboard/likes";
import { loadMyMixThanksMap } from "@/lib/dashboard/mix-thanks";
import { loadArtistNotifications } from "@/lib/dashboard/notifications";
import { loadFollowingAmong } from "@/lib/dashboard/people-follows";
import { loadMyPlaylistCommentThanksMap } from "@/lib/dashboard/playlist-comment-thanks";
import { loadFollowingAmongPlaylists } from "@/lib/dashboard/playlist-follows";
import { loadFirstTracksForPlaylists } from "@/lib/dashboard/playlists";
import { createClient } from "@/lib/supabase/server";
import { isDemoTrack, type TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

/** Inbox — social notifications (follows, shares, tips…). Not Hearing Aids podcasts. */
export default async function InboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/inbox");
  }

  const result = await loadArtistNotifications(supabase, user.id);
  const fan = result.notifications.filter(
    (n) =>
      n.kind === "release" ||
      n.kind === "live_room" ||
      n.kind === "people_follow" ||
      n.kind === "playlist_follow" ||
      n.kind === "playlist_copy" ||
      n.kind === "friend_mix" ||
      n.kind === "track_share" ||
      n.kind === "playlist_share" ||
      n.kind === "comment_reply" ||
      n.kind === "tip_thanks" ||
      n.kind === "share_thanks" ||
      n.kind === "playlist_follow_thanks" ||
      n.kind === "playlist_copy_thanks" ||
      n.kind === "people_follow_thanks" ||
      n.kind === "follow_thanks" ||
      n.kind === "comment_like_thanks" ||
      n.kind === "playlist_comment_like_thanks" ||
      n.kind === "activity_thanks" ||
      n.kind === "like_thanks" ||
      n.kind === "comment_thanks" ||
      n.kind === "playlist_comment_thanks" ||
      n.kind === "mix_thanks" ||
      n.kind === "playlist_collab_invite" ||
      n.kind === "playlist_collab_request" ||
      n.kind === "playlist_collab_accepted" ||
      n.kind === "playlist_collab_add" ||
      n.kind === "playlist_collab_declined" ||
      n.kind === "playlist_collab_left" ||
      n.kind === "playlist_collab_removed" ||
      n.kind === "comment_like" ||
      n.kind === "playlist_track_add" ||
      n.kind === "playlist_comment" ||
      n.kind === "playlist_comment_reply" ||
      n.kind === "playlist_comment_like",
  );

  const followActors = [
    ...new Set(
      fan
        .filter(
          (n) =>
            (n.kind === "people_follow" ||
              n.kind === "track_share" ||
              n.kind === "playlist_share" ||
              n.kind === "friend_mix" ||
              n.kind === "mix_thanks" ||
              n.kind === "playlist_comment_thanks" ||
              n.kind === "playlist_track_add" ||
              n.kind === "playlist_collab_add" ||
              n.kind === "comment_like" ||
              n.kind === "playlist_comment_like" ||
              n.kind === "comment_reply" ||
              n.kind === "playlist_comment" ||
              n.kind === "playlist_comment_reply") &&
            n.actor_id,
        )
        .map((n) => n.actor_id as string),
    ),
  ];
  const actionTrackIds = [
    ...new Set(
      fan
        .filter(
          (n) =>
            (n.kind === "release" ||
              n.kind === "track_share" ||
              n.kind === "playlist_track_add" ||
              n.kind === "playlist_collab_add" ||
              n.kind === "comment_like" ||
              n.kind === "tip_thanks" ||
              n.kind === "share_thanks" ||
              n.kind === "comment_like_thanks" ||
              n.kind === "activity_thanks" ||
              n.kind === "like_thanks" ||
              n.kind === "comment_thanks") &&
            n.track_id,
        )
        .map((n) => n.track_id as string),
    ),
  ];
  const releaseArtistIds = [
    ...new Set(
      fan
        .filter((n) => n.kind === "release" && n.actor_id)
        .map((n) => n.actor_id as string),
    ),
  ];
  const actionPlaylistIds = [
    ...new Set(
      fan
        .filter(
          (n) =>
            (n.kind === "playlist_share" ||
              n.kind === "friend_mix" ||
              n.kind === "share_thanks" ||
              n.kind === "playlist_follow_thanks" ||
              n.kind === "playlist_copy_thanks" ||
              n.kind === "mix_thanks" ||
              n.kind === "playlist_comment_thanks") &&
            n.playlist_id,
        )
        .map((n) => n.playlist_id as string),
    ),
  ];
  const mixPlaylistIds = [
    ...new Set(
      fan
        .filter((n) => n.kind === "friend_mix" && n.playlist_id)
        .map((n) => n.playlist_id as string),
    ),
  ];
  const sharePlaylistIds = [
    ...new Set(
      fan
        .filter((n) => n.kind === "playlist_share" && n.playlist_id)
        .map((n) => n.playlist_id as string),
    ),
  ];
  const copyPlaylistIds = [
    ...new Set(
      fan
        .filter((n) => n.kind === "playlist_copy" && n.related_playlist_id)
        .map((n) => n.related_playlist_id as string),
    ),
  ];
  const mixCommentPlaylistIds = [
    ...new Set(
      fan
        .filter(
          (n) =>
            (n.kind === "playlist_comment" ||
              n.kind === "playlist_comment_reply" ||
              n.kind === "playlist_comment_like") &&
            n.playlist_id,
        )
        .map((n) => n.playlist_id as string),
    ),
  ];
  const commentIds = [
    ...new Set(
      fan
        .filter((n) => n.kind === "comment_reply" && n.comment_id != null)
        .map((n) => n.comment_id as number),
    ),
  ];
  const playlistCommentIds = [
    ...new Set(
      fan
        .filter(
          (n) =>
            (n.kind === "playlist_comment" ||
              n.kind === "playlist_comment_reply") &&
            n.playlist_comment_id != null,
        )
        .map((n) => n.playlist_comment_id as number),
    ),
  ];

  const [
    among,
    likedAmong,
    playlistAmong,
    mixThanksMap,
    commentThanksMap,
    playlistCommentThanksMap,
    tracksRes,
    sharePreviews,
  ] = await Promise.all([
    loadFollowingAmong(supabase, user.id, followActors),
    loadLikedAmongTrackIds(supabase, user.id, actionTrackIds),
    loadFollowingAmongPlaylists(supabase, user.id, actionPlaylistIds),
    loadMyMixThanksMap(supabase, user.id, mixPlaylistIds),
    loadMyCommentThanksMap(supabase, user.id, commentIds),
    loadMyPlaylistCommentThanksMap(supabase, user.id, playlistCommentIds),
    actionTrackIds.length > 0
      ? supabase
          .from("tracks")
          .select(
            "id, title, artist_id, genre, status, audio_url, cover_art_url, play_count, duration_secs",
          )
          .in("id", actionTrackIds)
      : Promise.resolve({ data: [] as TrackRow[], error: null }),
    loadFirstTracksForPlaylists(supabase, [
      ...new Set([
        ...sharePlaylistIds,
        ...mixPlaylistIds,
        ...copyPlaylistIds,
        ...mixCommentPlaylistIds,
      ]),
    ]),
  ]);

  const trackArtistIds = ((tracksRes.data ?? []) as TrackRow[])
    .map((t) => t.artist_id)
    .filter((id): id is string => Boolean(id));
  const artistIdsForFollow = [
    ...new Set([...releaseArtistIds, ...trackArtistIds]),
  ];
  const artistAmong = await loadFollowingAmongArtists(
    supabase,
    user.id,
    artistIdsForFollow,
  );

  const followingActors: Record<string, boolean> = {};
  for (const id of among.followingIds) {
    followingActors[id] = true;
  }
  const followingArtists: Record<string, boolean> = {};
  for (const id of artistAmong.followingIds) {
    followingArtists[id] = true;
  }

  const likedTracks: Record<string, boolean> = {};
  for (const id of likedAmong.likedIds) {
    likedTracks[id] = true;
  }
  const followingPlaylists: Record<string, boolean> = {};
  for (const id of playlistAmong.followingIds) {
    followingPlaylists[id] = true;
  }
  const releaseTracks: Record<string, TrackRow> = {};
  for (const row of (tracksRes.data ?? []) as TrackRow[]) {
    if (!row?.id || isDemoTrack(row)) continue;
    releaseTracks[row.id] = row;
  }

  const mixThanksByPlaylist: Record<string, string> = {};
  for (const [id, msg] of mixThanksMap) {
    mixThanksByPlaylist[id] = msg;
  }
  const commentThanksById: Record<number, string> = {};
  for (const [id, msg] of commentThanksMap) {
    commentThanksById[id] = msg;
  }
  const playlistCommentThanksById: Record<number, string> = {};
  for (const [id, msg] of playlistCommentThanksMap) {
    playlistCommentThanksById[id] = msg;
  }

  return (
    <ArtistInboxClient
      eyebrow="Hearing Aid"
      title="What you need to hear"
      subtitle="Releases, follows, shares, collabs, replies, and thanks"
      homeHref="/dashboard"
      homeLabel="Hearth"
      notifications={fan}
      unreadCount={fan.filter((n) => !n.read_at).length}
      loadError={result.error}
      missingTable={result.missingTable}
      emptyHint="Follow people, tip artists, or comment — thanks and replies land here."
      followingActors={followingActors}
      peopleFollowsReady={!among.missingTable}
      followingArtists={followingArtists}
      artistFollowsReady={!artistAmong.missingTable}
      likedTracks={likedTracks}
      likesReady={!likedAmong.missingTable}
      releaseTracks={releaseTracks}
      playlistPreviewTracks={sharePreviews.byPlaylistId}
      followingPlaylists={followingPlaylists}
      playlistFollowsReady={!playlistAmong.missingTable}
      mixThanksByPlaylist={mixThanksByPlaylist}
      commentThanksById={commentThanksById}
      playlistCommentThanksById={playlistCommentThanksById}
    />
  );
}
