import { RadioClient } from "@/app/radio/radio-client";
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
import {
  loadPlaceHubs,
  placeToSlug,
  resolvePlaceParam,
} from "@/lib/dashboard/places";
import { loadRadioStations } from "@/lib/dashboard/radio";
import { loadPlayCreditBalance } from "@/lib/dashboard/credits";
import { loadLikedAmongTrackIds } from "@/lib/dashboard/likes";
import { loadListenerTasteWithBehavior } from "@/lib/dashboard/behavior";
import { hasTasteSignal, tasteFromProfile } from "@/lib/dashboard/taste";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    language?: string;
    genre?: string;
    place?: string;
    station?: string;
  }>;
};

export default async function RadioPage({ searchParams }: Props) {
  const params = await searchParams;
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
  const stationParam =
    typeof params.station === "string" && params.station.trim()
      ? params.station.trim()
      : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let taste = tasteFromProfile(null);
  if (user) {
    taste = await loadListenerTasteWithBehavior(
      supabase,
      user.id,
      user.user_metadata as Record<string, unknown>,
    );
  }

  const [result, langHubs, genreHubs, placeHubs, creditsRes] =
    await Promise.all([
      loadRadioStations(
        supabase,
        taste,
        languageFilter,
        genreFilter,
        placeFilter,
      ),
      loadLanguageHubs(supabase, taste),
      loadGenreHubs(supabase, taste),
      loadPlaceHubs(supabase, taste),
      user
        ? loadPlayCreditBalance(supabase)
        : Promise.resolve({ credits: 0, missingTable: true }),
    ]);

  const radioTrackIds = [
    ...new Set(result.stations.flatMap((s) => s.tracks.map((t) => t.id))),
  ];
  const likedAmong =
    user && radioTrackIds.length > 0
      ? await loadLikedAmongTrackIds(supabase, user.id, radioTrackIds)
      : { likedIds: [] as string[], missingTable: true };
  const likedTracks: Record<string, boolean> = {};
  for (const id of likedAmong.likedIds) {
    likedTracks[id] = true;
  }

  return (
    <RadioClient
      stations={result.stations}
      loadError={result.error}
      personalized={hasTasteSignal(taste)}
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
      likedTracks={likedTracks}
      likesReady={Boolean(user) && !likedAmong.missingTable}
      initialStationId={stationParam}
      creditBalance={creditsRes.credits}
      creditsReady={Boolean(user) && !creditsRes.missingTable}
    />
  );
}
