import Link from "next/link";
import { ChartBoard } from "@/app/charts/charts-board-client";
import { GenreFilterChips } from "@/components/genre-filter-chips";
import { LanguageFilterChips } from "@/components/language-filter-chips";
import { PlaceFilterChips } from "@/components/place-filter-chips";
import { RectLogo } from "@/components/rect-logo";
import {
  ALKEBULAN_CHART_PLACES,
  DAKAR_CHART_PLACES,
} from "@/lib/dashboard/charts";
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
import {
  activeDaypartFromTaste,
  DAYPART_META,
  hasTasteSignal,
  loadListenerTaste,
  type ListenerTaste,
} from "@/lib/dashboard/taste";
import {
  loadRankedTracks,
  type RankedTrack,
  type TracksLoadResult,
} from "@/lib/dashboard/tracks";
import { loadLikedAmongTrackIds } from "@/lib/dashboard/likes";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ language?: string; genre?: string; place?: string }>;
};

const CHART_BOARDS = [
  {
    id: "dakar",
    title: "DAKAR TOP 7",
    subtitle: "City pulse · Senegal artists",
    limit: 7,
    placeKeys: DAKAR_CHART_PLACES,
    placeHref: "/places/senegal",
    emptyHint: "No Senegal plays yet. Listen and the board fills.",
  },
  {
    id: "current",
    title: "THE CURRENT",
    subtitle: "Top songs across RECT SOUND",
    forYouSubtitle: "Soft-ranked for your taste · top listens",
    forYouDaypartSubtitle: "Soft-ranked for your taste and listening time",
    limit: 10,
    emptyHint: "Play songs — the Current ranks real listens.",
  },
  {
    id: "first-light",
    title: "FIRST LIGHT",
    subtitle: "Newest published releases",
    limit: 8,
    sort: "newest" as const,
    emptyHint: "Waiting on the next release.",
  },
  {
    id: "alkebulan",
    title: "THE ALKEBULAN",
    subtitle: "Continental pulse · African places",
    limit: 12,
    placeKeys: ALKEBULAN_CHART_PLACES,
    emptyHint: "Artists with African places set will rank here.",
  },
] as const;

function boardTracks(res: TracksLoadResult): RankedTrack[] {
  return res.ok ? res.tracks : [];
}

export default async function ChartsPage({ searchParams }: Props) {
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let taste: ListenerTaste | null = null;
  let chartsHidden = false;
  if (user) {
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    taste = await loadListenerTaste(supabase, user.id, meta);

    const { data: privacyRow, error: privacyErr } = await supabase
      .from("users")
      .select("privacy_show_on_charts")
      .eq("id", user.id)
      .maybeSingle();

    if (
      !privacyErr ||
      !/privacy_show_on_charts|column .* does not exist/i.test(
        privacyErr.message,
      )
    ) {
      const fromDb = privacyRow?.privacy_show_on_charts;
      const fromMeta = meta.privacy_show_on_charts;
      chartsHidden =
        fromDb === false ||
        (fromDb == null && fromMeta === false);
    }
  }
  const personalized = taste != null && hasTasteSignal(taste);
  const tasteForRank = personalized ? taste : null;
  const activeDaypart = activeDaypartFromTaste(taste);
  const daypartLabel = activeDaypart
    ? DAYPART_META[activeDaypart].label
    : null;

  const [results, langHubs, genreHubs, placeHubs] = await Promise.all([
    Promise.all(
      CHART_BOARDS.map((board) =>
        loadRankedTracks(supabase, board.limit, tasteForRank, {
          placeKeys: "placeKeys" in board ? board.placeKeys : undefined,
          sort: "sort" in board ? board.sort : "plays",
          language: languageFilter,
          genre: genreFilter,
          place: placeFilter,
        }),
      ),
    ),
    loadLanguageHubs(supabase, taste),
    loadGenreHubs(supabase, taste),
    loadPlaceHubs(supabase, taste),
  ]);

  const firstError = results.find((r) => !r.ok)?.error ?? null;
  const anyTracks = results.some((r) => r.ok && r.tracks.length > 0);
  const allFailed = results.every((r) => !r.ok);

  const boards = CHART_BOARDS.map((board, i) => ({
    ...board,
    subtitle:
      board.id === "current" &&
      personalized &&
      "forYouSubtitle" in board
        ? daypartLabel && "forYouDaypartSubtitle" in board
          ? `${board.forYouDaypartSubtitle} · ${daypartLabel}`
          : board.forYouSubtitle
        : board.subtitle,
    tracks: boardTracks(results[i]),
    error: results[i].ok ? null : results[i].error,
  }));

  const chartTrackIds = [
    ...new Set(boards.flatMap((b) => b.tracks.map((t) => t.id))),
  ];
  const likedAmong =
    user && chartTrackIds.length > 0
      ? await loadLikedAmongTrackIds(supabase, user.id, chartTrackIds)
      : { likedIds: [] as string[], missingTable: true };
  const likedTracks: Record<string, boolean> = {};
  for (const id of likedAmong.likedIds) {
    likedTracks[id] = true;
  }
  const likesReady = Boolean(user) && !likedAmong.missingTable;

  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/dashboard" className="flex items-center gap-2">
            <RectLogo size={34} showWordmark />
          </Link>
          <nav className="flex gap-3 text-sm text-white/55">
            <Link href="/dashboard" className="hover:text-white">
              Home
            </Link>
            <Link href="/search" className="hover:text-white">
              Search
            </Link>
            <Link href="/charts" className="text-[#1DB954]">
              Charts
            </Link>
            <Link href="/profile" className="hover:text-white">
              You
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-8 px-5 py-10 sm:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            RECT SOUND Charts
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
            Chart room
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/45">
            Boards ranked from real plays — Dakar (Senegal), the Current, First
            Light, and Alkebulan.
            {personalized
              ? daypartLabel
                ? ` Soft-boosted for your places, genres, languages, and ${daypartLabel.toLowerCase()} listening.`
                : " Soft-boosted for your places, genres, and languages."
              : null}{" "}
            {!personalized ? (
              <Link
                href="/preferences"
                className="text-[#1DB954] hover:underline"
              >
                Set taste
              </Link>
            ) : null}
          </p>
          {chartsHidden ? (
            <p className="mt-4 max-w-xl rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/50">
              Your plays stay off these boards.{" "}
              <Link
                href="/profile"
                className="text-[#1DB954] hover:underline"
              >
                Turn on Appear on charts
              </Link>{" "}
              in Profile if you want listens to count.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <PlaceFilterChips
            activeSlug={placeSlug}
            basePath="/charts"
            keepParams={{
              genre: genreSlug || undefined,
              language: languageSlug || undefined,
            }}
            places={placeHubs.hubs.map((h) => ({
              slug: h.slug,
              name: h.name,
            }))}
          />
          <GenreFilterChips
            activeSlug={genreSlug}
            basePath="/charts"
            keepParams={{
              language: languageSlug || undefined,
              place: placeSlug || undefined,
            }}
            genres={genreHubs.hubs.map((h) => ({
              slug: h.slug,
              name: h.name,
            }))}
          />
          <LanguageFilterChips
            activeSlug={languageSlug}
            basePath="/charts"
            keepParams={{
              genre: genreSlug || undefined,
              place: placeSlug || undefined,
            }}
            languages={langHubs.hubs.map((h) => ({
              slug: h.slug,
              name: h.name,
            }))}
          />
        </div>
        {placeFilter || genreFilter || languageFilter ? (
          <p className="text-xs text-white/40">
            Boards filtered
            {placeFilter ? ` · ${placeFilter}` : ""}
            {genreFilter ? ` · ${genreFilter}` : ""}
            {languageFilter ? ` · ${languageFilter}` : ""}.
          </p>
        ) : null}

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {boards.map((b) => (
            <a
              key={b.id}
              href={`#${b.title.toLowerCase().replace(/\s+/g, "-")}`}
              className="shrink-0 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/55 hover:border-[#1DB954]/50 hover:text-[#1DB954]"
            >
              {b.title}
            </a>
          ))}
        </div>

        {allFailed ? (
          <div className="rounded-2xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-6 py-8 text-center text-sm text-[#1DB954]">
            Could not load charts. {firstError}
          </div>
        ) : !anyTracks ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-16 text-center">
            <p className="text-lg font-medium">Boards are ready</p>
            <p className="mt-2 text-sm text-white/40">
              {placeFilter || genreFilter || languageFilter
                ? `No ranked plays for ${[placeFilter, genreFilter, languageFilter].filter(Boolean).join(" · ")} yet.`
                : "No ranked plays yet. Publish tracks, set artist places, and listen — boards fill from real data."}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link
                href="/search"
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-medium text-white/70 hover:border-[#1DB954]/50 hover:text-white"
              >
                Browse Search
              </Link>
              <Link
                href="/places/senegal"
                className="rounded-full bg-[#1DB954] px-4 py-2 text-xs font-semibold text-black hover:bg-[#17a349]"
              >
                Senegal hub
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {boards.map((b) => (
              <ChartBoard
                key={b.id}
                title={b.title}
                subtitle={b.subtitle}
                tracks={b.tracks}
                emptyHint={b.emptyHint}
                placeHref={"placeHref" in b ? b.placeHref : undefined}
                error={b.error}
                likedTracks={likedTracks}
                likesReady={likesReady}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
