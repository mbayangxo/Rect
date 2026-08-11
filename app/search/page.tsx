import { SearchClient } from "@/app/search/search-client";
import { loadFollowingAmongArtists } from "@/lib/dashboard/follows";
import {
  genreToSlug,
  loadGenreHubs,
  resolveGenreParam,
} from "@/lib/dashboard/genres";
import {
  languageToSlug,
  loadLanguageHubs,
  resolveLanguageParam,
} from "@/lib/dashboard/languages";
import { loadFollowingAmong } from "@/lib/dashboard/people-follows";
import {
  loadPlaceHubs,
  placeToSlug,
  resolvePlaceParam,
} from "@/lib/dashboard/places";
import { searchCatalog } from "@/lib/dashboard/search";
import { loadLikedAmongTrackIds } from "@/lib/dashboard/likes";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    q?: string;
    language?: string;
    genre?: string;
    place?: string;
  }>;
};

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const languageFilter = resolveLanguageParam(
    typeof params.language === "string" ? params.language : null,
  );
  const languageSlug = languageFilter
    ? languageToSlug(languageFilter)
    : null;
  const genreFilter = resolveGenreParam(
    typeof params.genre === "string" ? params.genre : null,
  );
  const genreSlug = genreFilter ? genreToSlug(genreFilter) : null;
  const placeFilter = resolvePlaceParam(
    typeof params.place === "string" ? params.place : null,
  );
  const placeSlug = placeFilter ? placeToSlug(placeFilter) : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [result, langHubs, genreHubs, placeHubs] = await Promise.all([
    searchCatalog(supabase, q, {
      viewerId: user?.id ?? null,
      language: languageFilter,
      genre: genreFilter,
      place: placeFilter,
    }),
    loadLanguageHubs(supabase),
    loadGenreHubs(supabase),
    loadPlaceHubs(supabase),
  ]);

  const peopleIds = result.people
    .map((p) => p.id)
    .filter((id) => id && id !== user?.id);
  const artistIds = result.artists
    .map((a) => a.id)
    .filter((id) => id && id !== user?.id);

  const [amongPeople, amongArtists, likedAmong] = user
    ? await Promise.all([
        loadFollowingAmong(supabase, user.id, peopleIds),
        loadFollowingAmongArtists(supabase, user.id, artistIds),
        loadLikedAmongTrackIds(
          supabase,
          user.id,
          result.tracks.map((t) => t.id),
        ),
      ])
    : [
        { followingIds: [] as string[], missingTable: false },
        { followingIds: [] as string[], missingTable: false },
        { likedIds: [] as string[], missingTable: true },
      ];

  const followingPeople: Record<string, boolean> = {};
  for (const id of amongPeople.followingIds) {
    followingPeople[id] = true;
  }

  const followingArtists: Record<string, boolean> = {};
  for (const id of amongArtists.followingIds) {
    followingArtists[id] = true;
  }
  const likedTracks: Record<string, boolean> = {};
  for (const id of likedAmong.likedIds) {
    likedTracks[id] = true;
  }

  return (
    <SearchClient
      initialQuery={q}
      initialTracks={result.tracks}
      initialArtists={result.artists}
      initialPlaylists={result.playlists}
      initialPeople={result.people}
      initialError={result.error}
      viewerId={user?.id ?? null}
      followingPeople={followingPeople}
      peopleFollowsReady={!amongPeople.missingTable}
      followingArtists={followingArtists}
      artistFollowsReady={!amongArtists.missingTable}
      likedTracks={likedTracks}
      likesReady={Boolean(user) && !likedAmong.missingTable}
      languageSlug={languageSlug}
      languageLabel={languageFilter}
      languageChips={langHubs.hubs.map((h) => ({
        slug: h.slug,
        name: h.name,
      }))}
      genreSlug={genreSlug}
      genreLabel={genreFilter}
      genreChips={genreHubs.hubs.map((h) => ({
        slug: h.slug,
        name: h.name,
      }))}
      placeSlug={placeSlug}
      placeLabel={placeFilter}
      placeChips={placeHubs.hubs.map((h) => ({
        slug: h.slug,
        name: h.name,
      }))}
    />
  );
}
