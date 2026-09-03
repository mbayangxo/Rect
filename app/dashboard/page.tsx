import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { loadArtistPortals } from "@/lib/dashboard/artists";
import {
  loadPendingPackPurchases,
  loadPlayCreditBalance,
} from "@/lib/dashboard/credits";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { loadLikedAmongTrackIds, loadLikedTrackIds } from "@/lib/dashboard/likes";
import { loadContinueListening } from "@/lib/dashboard/listening-journal";
import { loadArtistNotifications } from "@/lib/dashboard/notifications";
import {
  loadFriendsLikes,
  loadFriendsListening,
  loadFriendsMixes,
} from "@/lib/dashboard/people-follows";
import { loadFollowingAmongPlaylists } from "@/lib/dashboard/playlist-follows";
import { loadFirstTracksForPlaylists } from "@/lib/dashboard/playlists";
import { loadPlayPacks } from "@/lib/dashboard/play-packs";
import {
  activeDaypartFromTaste,
  DAYPART_META,
  hasTasteSignal,
  packCountryFromTaste,
  tasteFromProfile,
} from "@/lib/dashboard/taste";
import { loadFeaturedTracks } from "@/lib/dashboard/tracks";
import { loadNewSoundsTracks } from "@/lib/dashboard/new-sounds";
import { loadNewWaveShows } from "@/lib/dashboard/new-wave-shows";
import { loadPublicLiveNow } from "@/lib/dashboard/live-rooms";
import {
  loadTrendingPortals,
  loadTrendingTracks,
} from "@/lib/dashboard/trending";
import { createClient } from "@/lib/supabase/server";
import type { TrackRow } from "@/lib/tracks";
import "./dashboard.css";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const current = await getDashboardCurrentUser(supabase);

  if (!current.ok && current.reason === "no_session") {
    redirect("/auth/login?next=/dashboard");
  }

  if (!current.ok) {
    if (
      current.reason === "no_session" ||
      /session missing|Auth session missing/i.test(current.error)
    ) {
      redirect("/auth/login?next=/dashboard");
    }
    return (
      <main className="dash-app w-full max-w-none">
        <header className="dash-topbar mx-auto w-full max-w-7xl px-4 sm:px-8">
          <div className="dash-logo-wrap">
            <div className="dash-logo-box">
              <span className="dash-logo-ect">RECT</span>
            </div>
            <div className="dash-logo-divider" />
            <span className="dash-logo-section">Sound</span>
          </div>
        </header>
        <div className="dash-empty" role="alert">
          <p className="dash-empty-title">Could not load your account</p>
          <p className="dash-empty-body">{current.error}</p>
          <Link href="/auth/login?next=/dashboard" className="dash-empty-link">
            Log in
          </Link>
        </div>
      </main>
    );
  }

  const taste = tasteFromProfile(current.profile);
  const packCountry = packCountryFromTaste(taste);
  const personalized = hasTasteSignal(taste);
  const activeDaypart = activeDaypartFromTaste(taste);
  const tasteDaypart = activeDaypart
    ? DAYPART_META[activeDaypart].label
    : null;

  const [
    featuredRes,
    artistsRes,
    packsRes,
    creditsRes,
    pendingPacksRes,
    likesRes,
    continueRes,
    inboxRes,
    friendsRes,
    friendsLikesRes,
    friendsMixesRes,
    liveNowRes,
    trendingTracksRes,
    trendingPortalsRes,
    newSoundsRes,
    newWaveShowsRes,
  ] = await Promise.all([
    loadFeaturedTracks(supabase, taste),
    loadArtistPortals(supabase, taste),
    loadPlayPacks(supabase, packCountry),
    loadPlayCreditBalance(supabase),
    loadPendingPackPurchases(supabase),
    loadLikedTrackIds(supabase, current.user.id),
    loadContinueListening(supabase, current.user.id, 8),
    loadArtistNotifications(supabase, current.user.id, 40),
    loadFriendsListening(supabase, current.user.id, 8),
    loadFriendsLikes(supabase, current.user.id, 8),
    loadFriendsMixes(supabase, current.user.id, 6),
    loadPublicLiveNow(supabase, 16),
    loadTrendingTracks(supabase, 10),
    loadTrendingPortals(supabase, 8),
    loadNewSoundsTracks(supabase, 12),
    loadNewWaveShows(supabase, current.user.id, 10),
  ]);

  const releaseUnread = inboxRes.notifications.filter(
    (n) =>
      (n.kind === "release" ||
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
        n.kind === "playlist_comment_like") &&
      !n.read_at,
  ).length;

  const friendTrackIds = [
    ...new Set([
      ...friendsRes.items.map((t) => t.id),
      ...friendsLikesRes.items.map((t) => t.id),
    ]),
  ].filter(Boolean);
  const friendMixIds = [
    ...new Set(friendsMixesRes.items.map((p) => p.id).filter(Boolean)),
  ];
  const [friendLikedAmong, playlistAmong, mixPreviews] = await Promise.all([
    friendTrackIds.length > 0
      ? loadLikedAmongTrackIds(supabase, current.user.id, friendTrackIds)
      : Promise.resolve({ likedIds: [] as string[], missingTable: false }),
    friendMixIds.length > 0
      ? loadFollowingAmongPlaylists(
          supabase,
          current.user.id,
          friendMixIds,
        )
      : Promise.resolve({
          followingIds: [] as string[],
          missingTable: false,
        }),
    loadFirstTracksForPlaylists(supabase, friendMixIds),
  ]);
  const likedTrackIds = [
    ...new Set([...likesRes.likedIds, ...friendLikedAmong.likedIds]),
  ];
  const followingPlaylists: Record<string, boolean> = {};
  for (const id of playlistAmong.followingIds) {
    followingPlaylists[id] = true;
  }
  const playlistPreviewTracks: Record<string, TrackRow> =
    mixPreviews.byPlaylistId;

  return (
    <DashboardShell
      displayName={current.displayName}
      featured={featuredRes.tracks}
      featuredError={featuredRes.ok ? null : featuredRes.error}
      artists={artistsRes.artists}
      artistsError={artistsRes.ok ? null : artistsRes.error}
      packs={packsRes.ok ? packsRes.packs : []}
      packsError={packsRes.ok ? null : packsRes.error}
      packCountry={
        packsRes.ok && packsRes.packs[0]?.country
          ? packsRes.packs[0].country
          : packCountry
      }
      personalized={personalized}
      tasteGenres={taste.genres.slice(0, 3)}
      tasteCountries={taste.countries.slice(0, 2)}
      tasteDaypart={tasteDaypart}
      creditBalance={creditsRes.credits}
      creditsReady={!creditsRes.missingTable}
      pendingPackPurchases={pendingPacksRes.purchases}
      likedTrackIds={likedTrackIds}
      likesReady={!likesRes.missingTable && !friendLikedAmong.missingTable}
      inboxUnread={releaseUnread}
      continueListening={continueRes.entries}
      continueError={continueRes.error}
      friendsListening={friendsRes.items}
      friendsError={friendsRes.error}
      friendsLikes={friendsLikesRes.items}
      friendsLikesError={friendsLikesRes.error}
      friendsMixes={friendsMixesRes.items}
      friendsMixesError={friendsMixesRes.error}
      followingPlaylists={followingPlaylists}
      playlistFollowsReady={!playlistAmong.missingTable}
      playlistPreviewTracks={playlistPreviewTracks}
      liveNow={liveNowRes.rooms}
      trendingTracks={trendingTracksRes.tracks}
      trendingPortals={trendingPortalsRes.portals}
      newSoundsTracks={newSoundsRes.tracks}
      newWaveShows={newWaveShowsRes.shows}
    />
  );
}
