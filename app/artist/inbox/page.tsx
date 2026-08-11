import { redirect } from "next/navigation";
import { ArtistInboxClient } from "@/app/artist/inbox/inbox-client";
import { loadMyCommentThanksMap } from "@/lib/dashboard/comment-thanks";
import { loadFollowingAmongArtists } from "@/lib/dashboard/follows";
import { loadLikedAmongTrackIds } from "@/lib/dashboard/likes";
import { loadMyLikeThanksMap } from "@/lib/dashboard/like-thanks";
import { loadArtistNotifications } from "@/lib/dashboard/notifications";
import { loadFollowingAmong } from "@/lib/dashboard/people-follows";
import { loadMyPlayThanksMap } from "@/lib/dashboard/play-thanks";
import { loadMyPlaylistCommentThanksMap } from "@/lib/dashboard/playlist-comment-thanks";
import { loadFirstTracksForPlaylists } from "@/lib/dashboard/playlists";
import { createClient } from "@/lib/supabase/server";
import { isDemoTrack, type TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

const STUDIO_KINDS = new Set([
  "follow",
  "tip",
  "like",
  "listen",
  "comment",
  "playlist_follow",
  "playlist_copy",
  "playlist_track_add",
  "playlist_comment",
  "playlist_comment_reply",
  "playlist_comment_like",
  "playlist_collab_accepted",
  "playlist_collab_declined",
  "playlist_collab_left",
  "playlist_collab_add",
  "playlist_collab_request",
]);

export default async function ArtistInboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/artist/inbox");
  }

  const result = await loadArtistNotifications(supabase, user.id);
  const studio = result.notifications.filter((n) => STUDIO_KINDS.has(n.kind));

  const followActors = [
    ...new Set(
      studio
        .filter(
          (n) =>
            n.actor_id &&
            (n.kind === "follow" ||
              n.kind === "tip" ||
              n.kind === "like" ||
              n.kind === "listen" ||
              n.kind === "comment" ||
              n.kind === "playlist_follow" ||
              n.kind === "playlist_copy" ||
              n.kind === "playlist_collab_request" ||
              n.kind === "playlist_collab_add" ||
              n.kind === "playlist_track_add" ||
              n.kind === "playlist_comment" ||
              n.kind === "playlist_comment_reply" ||
              n.kind === "playlist_comment_like"),
        )
        .map((n) => n.actor_id as string),
    ),
  ];
  const actionTrackIds = [
    ...new Set(
      studio
        .filter(
          (n) =>
            (n.kind === "playlist_track_add" ||
              n.kind === "playlist_collab_add" ||
              n.kind === "tip" ||
              n.kind === "like" ||
              n.kind === "listen" ||
              n.kind === "comment" ||
              n.kind === "comment_reply") &&
            n.track_id,
        )
        .map((n) => n.track_id as string),
    ),
  ];
  const listenPlayIds = [
    ...new Set(
      studio
        .filter((n) => n.kind === "listen" && n.play_id)
        .map((n) => n.play_id as string),
    ),
  ];
  const likePairs = studio
    .filter((n) => n.kind === "like" && n.actor_id && n.track_id)
    .map((n) => ({
      likerId: n.actor_id as string,
      trackId: n.track_id as string,
    }));
  const commentIds = [
    ...new Set(
      studio
        .filter(
          (n) =>
            (n.kind === "comment" || n.kind === "comment_reply") &&
            n.comment_id != null,
        )
        .map((n) => n.comment_id as number),
    ),
  ];
  const playlistCommentIds = [
    ...new Set(
      studio
        .filter(
          (n) =>
            (n.kind === "playlist_comment" ||
              n.kind === "playlist_comment_reply") &&
            n.playlist_comment_id != null,
        )
        .map((n) => n.playlist_comment_id as number),
    ),
  ];
  const copyPlaylistIds = [
    ...new Set(
      studio
        .filter((n) => n.kind === "playlist_copy" && n.related_playlist_id)
        .map((n) => n.related_playlist_id as string),
    ),
  ];
  const mixCommentPlaylistIds = [
    ...new Set(
      studio
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

  const [
    among,
    likedAmong,
    playThanksMap,
    likeThanksMap,
    commentThanksMap,
    playlistCommentThanksMap,
    tracksRes,
    playlistPreviews,
  ] = await Promise.all([
    loadFollowingAmong(supabase, user.id, followActors),
    loadLikedAmongTrackIds(supabase, user.id, actionTrackIds),
    loadMyPlayThanksMap(supabase, user.id, listenPlayIds),
    loadMyLikeThanksMap(supabase, user.id, likePairs),
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
      ...new Set([...copyPlaylistIds, ...mixCommentPlaylistIds]),
    ]),
  ]);

  const trackArtistIds = ((tracksRes.data ?? []) as TrackRow[])
    .map((t) => t.artist_id)
    .filter((id): id is string => Boolean(id));
  const artistAmong = await loadFollowingAmongArtists(
    supabase,
    user.id,
    trackArtistIds,
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
  const releaseTracks: Record<string, TrackRow> = {};
  for (const row of (tracksRes.data ?? []) as TrackRow[]) {
    if (!row?.id || isDemoTrack(row)) continue;
    releaseTracks[row.id] = row;
  }

  const playThanksByPlay: Record<string, string> = {};
  for (const [pid, msg] of playThanksMap) {
    playThanksByPlay[pid] = msg;
  }
  const likeThanksByPair: Record<string, string> = {};
  for (const [key, msg] of likeThanksMap) {
    likeThanksByPair[key] = msg;
  }
  const commentThanksById: Record<number, string> = {};
  for (const [cid, msg] of commentThanksMap) {
    commentThanksById[cid] = msg;
  }
  const playlistCommentThanksById: Record<number, string> = {};
  for (const [cid, msg] of playlistCommentThanksMap) {
    playlistCommentThanksById[cid] = msg;
  }

  return (
    <ArtistInboxClient
      title="Activity"
      subtitle="Fans, tips, likes, listens, comments, and your mixes"
      homeHref="/studio"
      homeLabel="Studio"
      notifications={studio}
      unreadCount={studio.filter((n) => !n.read_at).length}
      loadError={result.error}
      missingTable={result.missingTable}
      emptyHint="Follows, tips, likes, listens, comments, and mix activity will show up here."
      followingActors={followingActors}
      peopleFollowsReady={!among.missingTable}
      followingArtists={followingArtists}
      artistFollowsReady={!artistAmong.missingTable}
      likedTracks={likedTracks}
      likesReady={!likedAmong.missingTable}
      releaseTracks={releaseTracks}
      playlistPreviewTracks={playlistPreviews.byPlaylistId}
      playThanksByPlay={playThanksByPlay}
      likeThanksByPair={likeThanksByPair}
      commentThanksById={commentThanksById}
      playlistCommentThanksById={playlistCommentThanksById}
    />
  );
}
