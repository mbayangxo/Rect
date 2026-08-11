import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PeopleBlockButton } from "@/components/people-block-button";
import { PeopleFollowButton } from "@/components/people-follow-button";
import { PeopleSharedCollections } from "@/components/people-shared-collections";
import { PeopleSharedTracks } from "@/components/people-shared-tracks";
import { RectLogo } from "@/components/rect-logo";
import { loadIsBlocked, loadUsersAreBlocked } from "@/lib/dashboard/blocks";
import { loadFollowingAmongArtists } from "@/lib/dashboard/follows";
import { loadLikedAmongTrackIds } from "@/lib/dashboard/likes";
import {
  attachViewerFollowState,
  loadPublicPeopleFollowGraph,
  loadPersonFollowRelation,
  type FollowedPerson,
} from "@/lib/dashboard/people-follows";
import {
  formatPlayedAt,
  loadPublicPerson,
  personProfileHref,
} from "@/lib/dashboard/people";
import { loadFollowingAmongPlaylists } from "@/lib/dashboard/playlist-follows";
import { loadFirstTracksForPlaylists } from "@/lib/dashboard/playlists";
import { createClient } from "@/lib/supabase/server";
import type { TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

function PersonRoster({
  title,
  people,
  empty,
  error,
  viewerId,
  followsReady,
  loginNext,
}: {
  title: string;
  people: FollowedPerson[];
  empty: string;
  error: string | null;
  viewerId: string | null;
  followsReady: boolean;
  loginNext: string;
}) {
  return (
    <section>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
        {title}
      </h2>
      {error ? (
        <p className="text-sm text-[#1DB954]">{error}</p>
      ) : people.length === 0 ? (
        <p className="text-sm text-white/40">{empty}</p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
          {people.map((p) => {
            const isSelf = viewerId === p.id;
            const mutual = Boolean(p.viewer_follows && p.follows_viewer);
            const followsYouOnly = Boolean(
              p.follows_viewer && !p.viewer_follows,
            );
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 border-b border-white/[0.06] px-3 py-2.5 last:border-b-0"
              >
                <Link
                  href={personProfileHref(p.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 hover:text-[#1DB954]"
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
                      <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-[#1DB954]/70">
                        {(p.display_name.trim().slice(0, 2) || "LI").toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {p.display_name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-white/40">
                      {mutual
                        ? "Friends"
                        : followsYouOnly
                          ? "Follows you"
                          : [
                              p.countries.slice(0, 2).join(" · ") || null,
                              p.genres.slice(0, 2).join(" · ") || null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "On RECT SOUND"}
                    </span>
                  </span>
                </Link>
                {!isSelf && viewerId && followsReady ? (
                  <PeopleFollowButton
                    personId={p.id}
                    initialFollowing={Boolean(p.viewer_follows)}
                    initialCount={0}
                    followsReady={followsReady}
                    showCount={false}
                    followsYou={Boolean(p.follows_viewer)}
                    compact
                    className="mt-0 shrink-0"
                    loginNext={loginNext}
                  />
                ) : p.followed_at ? (
                  <span className="shrink-0 text-xs text-white/30">
                    {new Date(p.followed_at).toLocaleDateString()}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default async function PeopleProfilePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await loadPublicPerson(supabase, id);

  if (result.notFound) notFound();

  if (result.error) {
    return (
      <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
        <div className="mx-auto max-w-lg px-5 py-20 text-center text-sm text-[#1DB954]">
          Could not load profile. {result.error}
        </div>
      </main>
    );
  }

  if (result.private) {
    return (
      <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
        <header className="border-b border-white/10">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
            <Link href="/dashboard">
              <RectLogo size={34} showWordmark />
            </Link>
          </div>
        </header>
        <div className="mx-auto max-w-lg px-5 py-20 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Profile
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-syne)] text-3xl font-semibold">
            Private profile
          </h1>
          <p className="mt-3 text-sm text-white/45">
            This listener keeps their profile private.
          </p>
          <Link
            href="/search"
            className="mt-8 inline-block text-sm text-[#1DB954] hover:underline"
          >
            Back to Search
          </Link>
        </div>
      </main>
    );
  }

  const person = result.person!;

  // Artists already have a richer portal — send visitors there.
  if (person.is_artist && user?.id !== id) {
    redirect(`/artists/${id}`);
  }

  const isOwner = user?.id === id;

  const [blockMutual, blockOutgoing] = await Promise.all([
    user && !isOwner
      ? loadUsersAreBlocked(supabase, user.id, id)
      : Promise.resolve({ blocked: false, missingTable: false }),
    user && !isOwner
      ? loadIsBlocked(supabase, user.id, id)
      : Promise.resolve({ blocked: false, missingTable: false }),
  ]);

  if (blockMutual.blocked) {
    return (
      <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
        <header className="border-b border-white/10">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
            <Link href="/dashboard">
              <RectLogo size={34} showWordmark />
            </Link>
            <nav className="flex gap-4 text-sm text-white/55">
              <Link href="/search" className="hover:text-white">
                Search
              </Link>
              <Link href="/following" className="hover:text-white">
                Following
              </Link>
            </nav>
          </div>
        </header>
        <div className="mx-auto max-w-lg px-5 py-20 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Profile
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-syne)] text-3xl font-semibold">
            {blockOutgoing.blocked
              ? person.display_name
              : "Profile unavailable"}
          </h1>
          <p className="mt-3 text-sm text-white/45">
            {blockOutgoing.blocked
              ? "You’ve blocked this person. Unblock to see their profile again."
              : "This profile isn’t available."}
          </p>
          {blockOutgoing.blocked ? (
            <div className="mt-6 flex justify-center">
              <PeopleBlockButton
                personId={id}
                initialBlocked
                blocksReady={!blockMutual.missingTable && !blockOutgoing.missingTable}
                loginNext={`/people/${id}`}
                className="mt-0"
              />
            </div>
          ) : null}
          <Link
            href="/search"
            className="mt-8 inline-block text-sm text-[#1DB954] hover:underline"
          >
            Back to Search
          </Link>
        </div>
      </main>
    );
  }

  const [followRelation, followGraph] = await Promise.all([
    user && !isOwner
      ? loadPersonFollowRelation(supabase, user.id, id)
      : Promise.resolve({
          following: false,
          follows_you: false,
          mutual: false,
          missingTable: false,
        }),
    loadPublicPeopleFollowGraph(supabase, id, {
      viewerId: user?.id ?? null,
      limit: 40,
    }),
  ]);

  const showFollowGraph = followGraph.sharing;

  const [followersEnriched, followingEnriched] = showFollowGraph
    ? await Promise.all([
        attachViewerFollowState(supabase, user?.id, followGraph.followers),
        attachViewerFollowState(supabase, user?.id, followGraph.following),
      ])
    : [
        { people: [] as FollowedPerson[], missingTable: false },
        { people: [] as FollowedPerson[], missingTable: false },
      ];

  const followsReady = !followGraph.missingTable;

  const sharedTrackIds = [
    ...new Set([
      ...person.activity.map((e) => e.id),
      ...person.liked_tracks.map((t) => t.id),
    ]),
  ].filter(Boolean);

  const likedAmong =
    user && sharedTrackIds.length > 0
      ? await loadLikedAmongTrackIds(supabase, user.id, sharedTrackIds)
      : { likedIds: [] as string[], missingTable: true };

  const likedByViewer: Record<string, boolean> = {};
  for (const tid of likedAmong.likedIds) {
    likedByViewer[tid] = true;
  }
  const likesReady = Boolean(user) && !likedAmong.missingTable;

  const playlistIds = [
    ...new Set([
      ...person.playlists.map((p) => p.id),
      ...person.saved_playlists.map((p) => p.id),
    ]),
  ].filter(Boolean);
  const artistIds = person.followed_artists.map((a) => a.id).filter(Boolean);

  const [playlistAmong, artistAmong, mixPreviews] = await Promise.all([
    user && playlistIds.length > 0
      ? loadFollowingAmongPlaylists(supabase, user.id, playlistIds)
      : Promise.resolve({
          followingIds: [] as string[],
          missingTable: true,
        }),
    user && artistIds.length > 0
      ? loadFollowingAmongArtists(supabase, user.id, artistIds)
      : Promise.resolve({
          followingIds: [] as string[],
          missingTable: true,
        }),
    loadFirstTracksForPlaylists(supabase, playlistIds),
  ]);

  const followingPlaylists: Record<string, boolean> = {};
  for (const pid of playlistAmong.followingIds) {
    followingPlaylists[pid] = true;
  }
  const followingArtists: Record<string, boolean> = {};
  for (const aid of artistAmong.followingIds) {
    followingArtists[aid] = true;
  }
  const playlistFollowsReady = Boolean(user) && !playlistAmong.missingTable;
  const artistFollowsReady = Boolean(user) && !artistAmong.missingTable;
  const playlistPreviewTracks: Record<string, TrackRow> =
    mixPreviews.byPlaylistId;

  const blockState = blockOutgoing;

  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/dashboard">
            <RectLogo size={34} showWordmark />
          </Link>
          <nav className="flex gap-4 text-sm text-white/55">
            <Link href="/search" className="hover:text-white">
              Search
            </Link>
            <Link href="/following" className="hover:text-white">
              Following
            </Link>
            {isOwner ? (
              <Link href="/profile" className="hover:text-white">
                You
              </Link>
            ) : null}
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-8 px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border border-white/15 bg-white/[0.04] sm:h-28 sm:w-28">
            {person.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={person.avatar_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xl font-semibold text-[#1DB954]/70">
                {(person.display_name.trim().slice(0, 2) || "LI").toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
              {person.is_artist ? "Artist · listener" : "Listener"}
              {!isOwner && followRelation.mutual
                ? " · Friends"
                : !isOwner && followRelation.follows_you
                  ? " · Follows you"
                  : ""}
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-5xl">
              {person.display_name}
            </h1>
            <p className="mt-2 text-sm text-white/45">
              {[
                person.countries.slice(0, 3).join(" · ") || null,
                person.genres.slice(0, 3).join(" · ") || null,
                !person.countries.length && !person.genres.length
                  ? "On RECT SOUND"
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {!isOwner ? (
              <>
                {!blockState.blocked ? (
                  <PeopleFollowButton
                    personId={id}
                    initialFollowing={followRelation.following}
                    initialCount={
                      showFollowGraph ? followGraph.followerCount : 0
                    }
                    followsReady={!followGraph.missingTable}
                    followsYou={followRelation.follows_you}
                    loginNext={`/people/${id}`}
                  />
                ) : (
                  <p className="mt-4 text-sm text-white/45">You’ve blocked this person</p>
                )}
                <PeopleBlockButton
                  personId={id}
                  initialBlocked={blockState.blocked}
                  blocksReady={!blockState.missingTable}
                  loginNext={`/people/${id}`}
                />
              </>
            ) : null}
            {followsReady && showFollowGraph ? (
              <p className={`text-sm text-white/45 ${isOwner ? "mt-4" : "mt-3"}`}>
                <span className="text-white/70">
                  {followGraph.followerCount.toLocaleString()}
                </span>{" "}
                {followGraph.followerCount === 1 ? "follower" : "followers"}
                <span className="mx-2 text-white/25">·</span>
                <span className="text-white/70">
                  {followGraph.followingCount.toLocaleString()}
                </span>{" "}
                following
              </p>
            ) : !followsReady ? (
              <p className="mt-3 text-xs text-white/35">
                Run people follows SQL to unlock follower lists.
              </p>
            ) : null}
            {person.is_artist ? (
              <Link
                href={`/artists/${id}`}
                className="mt-4 inline-block text-sm text-[#1DB954] hover:underline"
              >
                Open artist portal →
              </Link>
            ) : null}
            {isOwner ? (
              <p className="mt-3 text-xs text-white/35">
                This is how others see you when Public profile is on.{" "}
                <Link
                  href="/profile"
                  className="text-[#1DB954] hover:underline"
                >
                  Privacy settings
                </Link>
              </p>
            ) : null}
          </div>
        </div>

        {showFollowGraph && followsReady ? (
          <div className="grid gap-8 sm:grid-cols-2">
            <PersonRoster
              title="Followers"
              people={followersEnriched.people}
              empty="No followers yet"
              error={followGraph.error}
              viewerId={user?.id ?? null}
              followsReady={followsReady}
              loginNext={`/people/${id}`}
            />
            <PersonRoster
              title="Following"
              people={followingEnriched.people}
              empty="Not following anyone yet"
              error={followGraph.error}
              viewerId={user?.id ?? null}
              followsReady={followsReady}
              loginNext={`/people/${id}`}
            />
          </div>
        ) : isOwner && followsReady ? (
          <p className="text-xs text-white/35">
            Share Followers &amp; Following from{" "}
            <Link href="/profile" className="text-[#1DB954] hover:underline">
              Privacy settings
            </Link>
            .
          </p>
        ) : null}

        <PeopleSharedTracks
          activity={person.activity}
          likedTracks={person.liked_tracks}
          showActivity={person.sharing_activity}
          showLikes={person.sharing_likes}
          likedByViewer={likedByViewer}
          likesReady={likesReady}
          loginNext={`/people/${id}`}
          formatPlayedAt={formatPlayedAt}
        />
        {!person.sharing_likes && isOwner ? (
          <p className="text-xs text-white/35">
            Share liked songs from{" "}
            <Link href="/profile" className="text-[#1DB954] hover:underline">
              Privacy settings
            </Link>
            .
          </p>
        ) : null}

        <PeopleSharedCollections
          profilePersonId={id}
          playlists={person.playlists}
          savedPlaylists={person.saved_playlists}
          showSaves={person.sharing_saves}
          followedArtists={person.followed_artists}
          showArtists={person.sharing_followed_artists}
          viewerId={user?.id ?? null}
          followingArtists={followingArtists}
          artistFollowsReady={artistFollowsReady}
          followingPlaylists={followingPlaylists}
          playlistFollowsReady={playlistFollowsReady}
          playlistPreviewTracks={playlistPreviewTracks}
          loginNext={`/people/${id}`}
        />
        {!person.sharing_saves && isOwner ? (
          <p className="text-xs text-white/35">
            Share saved mixes from{" "}
            <Link href="/profile" className="text-[#1DB954] hover:underline">
              Privacy settings
            </Link>
            .
          </p>
        ) : null}
        {!person.sharing_followed_artists && isOwner ? (
          <p className="text-xs text-white/35">
            Share followed artists from{" "}
            <Link href="/profile" className="text-[#1DB954] hover:underline">
              Privacy settings
            </Link>
            .
          </p>
        ) : null}

        {!person.sharing_activity &&
        !person.sharing_likes &&
        !person.sharing_saves &&
        !person.sharing_followed_artists &&
        !showFollowGraph &&
        person.playlists.length === 0 &&
        !person.is_artist ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
            <p className="text-base font-medium">Nothing shared yet</p>
            <p className="mt-2 text-sm text-white/40">
              Public mixes, saves, artists, listening, liked songs, or followers
              will show up here.
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
