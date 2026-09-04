import Link from "next/link";
import { ChartBoard } from "@/app/charts/charts-board-client";
import { GenreFilterChips } from "@/components/genre-filter-chips";
import { LanguageFilterChips } from "@/components/language-filter-chips";
import { PlaceFilterChips } from "@/components/place-filter-chips";
import { RectLogo } from "@/components/rect-logo";
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
import { loadListenerTasteWithBehavior } from "@/lib/dashboard/behavior";
import {
  activeDaypartFromTaste,
  DAYPART_META,
  hasTasteSignal,
  type ListenerTaste,
} from "@/lib/dashboard/taste";
import {
  loadRankedTracks,
  type RankedTrack,
  type TracksLoadResult,
} from "@/lib/dashboard/tracks";
import {
  loadStandingsBoard,
  STANDINGS_BOARDS,
  type StandingsEntry,
} from "@/lib/dashboard/standings";
import { loadLikedAmongTrackIds } from "@/lib/dashboard/likes";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ language?: string; genre?: string; place?: string }>;
};

const CHART_BOARDS = [
  {
    id: "dakar",
    title: "DAKAR STANDINGS",
    subtitle: "City · RECT SCORE · updates weekly",
    limit: 7,
    standingsId: "city-dakar" as const,
    placeHref: "/places/senegal",
    emptyHint: "No Senegal tracks yet. Publish live — every song enters STANDINGS.",
  },
  {
    id: "current",
    title: "THE CURRENT",
    subtitle: "Global · RECT SCORE · updates weekly",
    forYouSubtitle: "Global standings · RECT SCORE · updates weekly",
    limit: 10,
    standingsGlobal: true as const,
    emptyHint: "Play songs — STANDINGS rank by RECT SCORE.",
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
    subtitle: "Continental · RECT SCORE · updates weekly",
    limit: 12,
    standingsId: "alkebulan" as const,
    emptyHint: "Artists with African places set will rank here.",
  },
] as const;

function standingsToRanked(entries: StandingsEntry[]): RankedTrack[] {
  return entries.map((e) => ({
    id: e.id,
    title: e.title,
    audio_url: e.audio_url,
    cover_art_url: e.cover_art_url,
    genre: e.genre,
    language: e.language,
    artist_id: e.artist_id,
    duration_secs: e.duration_secs,
    status: e.status,
    created_at: e.created_at,
    artist_name: e.artist_name,
    play_count: e.play_count,
    like_count: e.like_count,
  }));
}

async function loadChartBoard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  board: (typeof CHART_BOARDS)[number],
  tasteForRank: ListenerTaste | null,
  filters: {
    languageFilter: string | null;
    genreFilter: string | null;
    placeFilter: string | null;
  },
): Promise<TracksLoadResult> {
  if ("standingsId" in board && board.standingsId) {
    const def = STANDINGS_BOARDS.find((b) => b.id === board.standingsId);
    if (!def) {
      return { ok: false, tracks: [], empty: true, error: "Board not found", source: null };
    }
    const res = await loadStandingsBoard(supabase, { ...def, limit: board.limit });
    if (res.error) {
      return { ok: false, tracks: [], empty: true, error: res.error, source: null };
    }
    const tracks = standingsToRanked(res.entries);
    return {
      ok: true,
      tracks,
      empty: tracks.length === 0,
      error: null,
      source: "plays_aggregate",
    };
  }

  if ("standingsGlobal" in board && board.standingsGlobal) {
    const res = await loadStandingsBoard(supabase, {
      id: "global",
      kind: "global",
      title: "THE CURRENT",
      subtitle: "Global · weekly",
      cadence: "weekly",
      limit: board.limit,
    });
    if (res.error) {
      return { ok: false, tracks: [], empty: true, error: res.error, source: null };
    }
    const tracks = standingsToRanked(res.entries);
    return {
      ok: true,
      tracks,
      empty: tracks.length === 0,
      error: null,
      source: "plays_aggregate",
    };
  }

  if (filters.genreFilter && board.id === "current") {
    const res = await loadStandingsBoard(supabase, {
      id: `genre-${filters.genreFilter}`,
      kind: "genre",
      title: filters.genreFilter,
      subtitle: "Genre · weekly",
      cadence: "weekly",
      genre: filters.genreFilter,
      limit: board.limit,
    });
    if (!res.error && res.entries.length > 0) {
      const tracks = standingsToRanked(res.entries);
      return {
        ok: true,
        tracks,
        empty: false,
        error: null,
        source: "plays_aggregate",
      };
    }
  }

  return loadRankedTracks(supabase, board.limit, tasteForRank, {
    sort: "sort" in board ? board.sort : "plays",
    language: filters.languageFilter,
    genre: filters.genreFilter,
    place: filters.placeFilter,
  });
}

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
    taste = await loadListenerTasteWithBehavior(supabase, user.id, meta);

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
        loadChartBoard(supabase, board, tasteForRank, {
          languageFilter,
          genreFilter,
          placeFilter,
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
            <Link href="/charts" className="text-[var(--rect)]">
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
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--rect)]">
            RECT SOUND Charts
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
            Chart room
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/45">
            STANDINGS ranked by RECT SCORE — 25% authenticated streams, 25%
            engagement, 20% purchases (songs, albums, CDs, vinyl), 15% editorial,
            15% cultural resonance. City and genre boards update weekly;
            boards update weekly; neighborhood boards update daily.
            {personalized
              ? daypartLabel
                ? ` Soft-boosted for your places, genres, languages, and ${daypartLabel.toLowerCase()} listening.`
                : " Soft-boosted for your places, genres, and languages."
              : null}{" "}
            {!personalized ? (
              <Link
                href="/preferences"
                className="text-[var(--rect)] hover:underline"
              >
                Set taste
              </Link>
            ) : null}
          </p>
          {user ? (
            <Link
              href="/charts/my"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--rect)]/35 px-4 py-2 text-sm font-medium text-[var(--rect)] hover:bg-[var(--rect)]/10"
            >
              My personal chart →
            </Link>
          ) : null}
          {chartsHidden ? (
            <p className="mt-4 max-w-xl rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/50">
              Your plays stay off these boards.{" "}
              <Link
                href="/profile"
                className="text-[var(--rect)] hover:underline"
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
              className="shrink-0 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/55 hover:border-[var(--rect)]/50 hover:text-[var(--rect)]"
            >
              {b.title}
            </a>
          ))}
        </div>

        {allFailed ? (
          <div className="rounded-2xl border border-[var(--rect)]/30 bg-[var(--rect)]/10 px-6 py-8 text-center text-sm text-[var(--rect)]">
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
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-medium text-white/70 hover:border-[var(--rect)]/50 hover:text-white"
              >
                Browse Search
              </Link>
              <Link
                href="/places/senegal"
                className="rounded-full bg-[var(--rect)] px-4 py-2 text-xs font-semibold text-black hover:bg-[var(--rect-sand)]"
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
