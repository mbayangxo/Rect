import { redirect } from "next/navigation";
import { FollowingClient } from "@/app/following/following-client";
import { loadFollowingFeed } from "@/lib/dashboard/follows";
import {
  attachViewerFollowState,
  loadFollowedPeople,
  loadFriendsLikes,
  loadFriendsListening,
  loadFriendsMixes,
} from "@/lib/dashboard/people-follows";
import { loadLikedAmongTrackIds } from "@/lib/dashboard/likes";
import { loadFollowingAmongPlaylists } from "@/lib/dashboard/playlist-follows";
import { loadFirstTracksForPlaylists } from "@/lib/dashboard/playlists";
import { createClient } from "@/lib/supabase/server";
import type { TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

export default async function FollowingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/following");
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  let followedArtistsHidden = true;
  let followersHidden = true;

  const { data: privacyRow, error: privacyErr } = await supabase
    .from("users")
    .select("privacy_show_followed_artists, privacy_show_followers")
    .eq("id", user.id)
    .maybeSingle();

  if (
    privacyErr &&
    /privacy_show_followers|column .* does not exist/i.test(privacyErr.message) &&
    !/privacy_show_followed_artists/i.test(
      privacyErr.message.replace(/privacy_show_followers/gi, ""),
    )
  ) {
    const lean = await supabase
      .from("users")
      .select("privacy_show_followed_artists")
      .eq("id", user.id)
      .maybeSingle();
    if (
      !lean.error ||
      !/privacy_show_followed_artists|column .* does not exist/i.test(
        lean.error.message,
      )
    ) {
      const fromDb = lean.data?.privacy_show_followed_artists;
      const fromMeta = meta.privacy_show_followed_artists;
      followedArtistsHidden =
        fromDb !== true && !(fromDb == null && fromMeta === true);
    }
  } else if (
    !privacyErr ||
    !/privacy_show_followed_artists|privacy_show_followers|column .* does not exist/i.test(
      privacyErr.message,
    )
  ) {
    const fromArtists = privacyRow?.privacy_show_followed_artists;
    const fromFollowers = privacyRow?.privacy_show_followers;
    followedArtistsHidden =
      fromArtists !== true &&
      !(fromArtists == null && meta.privacy_show_followed_artists === true);
    followersHidden =
      fromFollowers !== true &&
      !(fromFollowers == null && meta.privacy_show_followers === true);
  }

  const [result, peopleRes, friendsRes, likesRes, mixesRes] =
    await Promise.all([
      loadFollowingFeed(supabase, user.id),
      loadFollowedPeople(supabase, user.id),
      loadFriendsListening(supabase, user.id, 16),
      loadFriendsLikes(supabase, user.id, 16),
      loadFriendsMixes(supabase, user.id, 12),
    ]);

  const peopleEnriched = await attachViewerFollowState(
    supabase,
    user.id,
    peopleRes.people.map((p) => ({ ...p, viewer_follows: true })),
  );

  const friendTrackIds = [
    ...new Set([
      ...friendsRes.items.map((t) => t.id),
      ...likesRes.items.map((t) => t.id),
      ...result.tracks.map((t) => t.id),
    ]),
  ].filter(Boolean);
  const friendMixIds = [
    ...new Set(mixesRes.items.map((p) => p.id).filter(Boolean)),
  ];
  const [likedAmong, playlistAmong, mixPreviews] = await Promise.all([
    loadLikedAmongTrackIds(supabase, user.id, friendTrackIds),
    friendMixIds.length > 0
      ? loadFollowingAmongPlaylists(supabase, user.id, friendMixIds)
      : Promise.resolve({
          followingIds: [] as string[],
          missingTable: false,
        }),
    loadFirstTracksForPlaylists(supabase, friendMixIds),
  ]);
  const likedTracks: Record<string, boolean> = {};
  for (const tid of likedAmong.likedIds) {
    likedTracks[tid] = true;
  }
  const followingPlaylists: Record<string, boolean> = {};
  for (const id of playlistAmong.followingIds) {
    followingPlaylists[id] = true;
  }
  const playlistPreviewTracks: Record<string, TrackRow> =
    mixPreviews.byPlaylistId;

  return (
    <FollowingClient
      artists={result.artists}
      tracks={result.tracks}
      people={peopleEnriched.people}
      friendsListening={friendsRes.items}
      friendsLikes={likesRes.items}
      friendsMixes={mixesRes.items}
      loadError={
        result.error ||
        peopleRes.error ||
        friendsRes.error ||
        likesRes.error ||
        mixesRes.error
      }
      missingTable={result.missingTable}
      peopleMissingTable={peopleRes.missingTable || peopleEnriched.missingTable}
      followedArtistsHidden={followedArtistsHidden}
      followersHidden={followersHidden}
      likedTracks={likedTracks}
      likesReady={!likedAmong.missingTable}
      followingPlaylists={followingPlaylists}
      playlistFollowsReady={!playlistAmong.missingTable}
      playlistPreviewTracks={playlistPreviewTracks}
    />
  );
}
