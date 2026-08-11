import { notFound } from "next/navigation";
import { PlaylistDetailClient } from "@/app/playlists/[id]/playlist-detail-client";
import {
  loadPlaylistCollabAskPending,
  loadPlaylistCollabAsks,
  loadPlaylistCollaborators,
} from "@/lib/dashboard/playlist-collaborators";
import { loadPlaylistComments } from "@/lib/dashboard/playlist-comments";
import {
  loadFriendsWhoSavedPlaylist,
  loadIsFollowingPlaylist,
  loadPlaylistFollowerCount,
  loadPlaylistFollowers,
} from "@/lib/dashboard/playlist-follows";
import { loadLikedAmongTrackIds } from "@/lib/dashboard/likes";
import { loadFollowingAmong } from "@/lib/dashboard/people-follows";
import { loadPlaylistDetail } from "@/lib/dashboard/playlists";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function PlaylistDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await loadPlaylistDetail(supabase, user?.id ?? null, id);

  if (result.notFound) notFound();

  const isOwner = Boolean(result.playlist?.is_owner);
  const isCollaborator = Boolean(result.playlist?.is_collaborator);
  const collabPending = Boolean(result.playlist?.collab_pending);
  const showCollabRoster = Boolean(
    result.playlist && (isOwner || isCollaborator || collabPending),
  );
  const canAsk =
    Boolean(user && result.playlist?.is_public) &&
    !isOwner &&
    !isCollaborator &&
    !collabPending;

  const [
    followState,
    countRes,
    saversRes,
    friendsSavedRes,
    collabRes,
    commentsRes,
    askRes,
    asksRes,
  ] = await Promise.all([
    user && result.playlist && !isOwner
      ? loadIsFollowingPlaylist(supabase, user.id, id)
      : Promise.resolve({ following: false, missingTable: false }),
    result.playlist
      ? loadPlaylistFollowerCount(supabase, id)
      : Promise.resolve({ count: 0, missingTable: true }),
    isOwner
      ? loadPlaylistFollowers(supabase, id, 40)
      : Promise.resolve({
          savers: [],
          missingTable: false,
          error: null as string | null,
        }),
    user && result.playlist
      ? loadFriendsWhoSavedPlaylist(supabase, user.id, id, 12)
      : Promise.resolve({
          savers: [],
          missingTable: false,
          error: null as string | null,
        }),
    showCollabRoster
      ? loadPlaylistCollaborators(supabase, id)
      : Promise.resolve({
          collaborators: [],
          missingTable: false,
          error: null as string | null,
        }),
    result.playlist
      ? loadPlaylistComments(supabase, id, {
          viewerId: user?.id ?? null,
        })
      : Promise.resolve({
          comments: [],
          missingTable: false,
          likesReady: false,
          error: null as string | null,
        }),
    canAsk
      ? loadPlaylistCollabAskPending(supabase, id)
      : Promise.resolve({ pending: false, missingRpc: false }),
    isOwner
      ? loadPlaylistCollabAsks(supabase, id)
      : Promise.resolve({
          asks: [],
          missingTable: false,
          error: null as string | null,
        }),
  ]);

  const trackIds = (result.playlist?.tracks ?? []).map((t) => t.id);
  const peopleRosterIds = [
    ...new Set(
      [
        ...saversRes.savers.map((s) => s.id),
        ...friendsSavedRes.savers.map((s) => s.id),
        ...collabRes.collaborators.map((c) => c.user_id),
        ...asksRes.asks.map((a) => a.user_id),
      ].filter((id) => id && id !== user?.id),
    ),
  ];
  const [likedAmong, peopleAmong] = await Promise.all([
    user && trackIds.length > 0
      ? loadLikedAmongTrackIds(supabase, user.id, trackIds)
      : Promise.resolve({ likedIds: [] as string[], missingTable: true }),
    user && peopleRosterIds.length > 0
      ? loadFollowingAmong(supabase, user.id, peopleRosterIds)
      : Promise.resolve({
          followingIds: [] as string[],
          missingTable: false,
        }),
  ]);
  const likedTracks: Record<string, boolean> = {};
  for (const tid of likedAmong.likedIds) {
    likedTracks[tid] = true;
  }
  const followingPeople: Record<string, boolean> = {};
  for (const pid of peopleAmong.followingIds) {
    followingPeople[pid] = true;
  }

  return (
    <PlaylistDetailClient
      playlist={result.playlist}
      loadError={result.error}
      missingTable={result.missingTable}
      initialFollowing={followState.following}
      followerCount={countRes.count}
      followsReady={!countRes.missingTable && !followState.missingTable}
      savers={saversRes.savers}
      saversError={saversRes.error}
      saversMissingTable={saversRes.missingTable}
      friendsSavers={friendsSavedRes.savers}
      followingPeople={followingPeople}
      peopleFollowsReady={Boolean(user) && !peopleAmong.missingTable}
      collaborators={collabRes.collaborators}
      collabReady={!collabRes.missingTable}
      askPending={askRes.pending}
      collabAsks={asksRes.asks}
      comments={commentsRes.comments}
      commentsMissing={commentsRes.missingTable}
      commentsError={commentsRes.error}
      commentsLikesReady={commentsRes.likesReady}
      signedIn={Boolean(user)}
      currentUserId={user?.id ?? null}
      likedTracks={likedTracks}
      likesReady={Boolean(user) && !likedAmong.missingTable}
    />
  );
}
