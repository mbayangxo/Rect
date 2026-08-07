import Link from "next/link";
import { RectLogo } from "@/components/rect-logo";
import {
  formatPlayCount,
  loadRankedTracks,
  trackArtist,
  trackTitle,
  type RankedTrack,
} from "@/lib/dashboard/tracks";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CHART_BOARDS = [
  {
    id: "dakar",
    title: "DAKAR TOP 7",
    subtitle: "City pulse · Dakar",
    limit: 7,
  },
  {
    id: "current",
    title: "THE CURRENT",
    subtitle: "Top songs across RECT SOUND",
    limit: 10,
  },
  {
    id: "first-light",
    title: "FIRST LIGHT",
    subtitle: "Emerging artists",
    limit: 8,
    sort: "newest" as const,
  },
  {
    id: "alkebulan",
    title: "THE ALKEBULAN",
    subtitle: "Continental pulse",
    limit: 12,
  },
] as const;

function ChartBoard({
  title,
  subtitle,
  tracks,
  empty,
  error,
}: {
  title: string;
  subtitle: string;
  tracks: RankedTrack[];
  empty: boolean;
  error: string | null;
}) {
  return (
    <section
      id={title.toLowerCase().replace(/\s+/g, "-")}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold tracking-tight text-[#1DB954] sm:text-xl">
            {title}
          </h2>
          <p className="mt-1 text-xs text-white/40 sm:text-sm">{subtitle}</p>
        </div>
        <span className="text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-white/30">
          RECT Charts
        </span>
      </div>

      {error ? (
        <p className="mt-6 text-center text-sm text-[#1DB954]">{error}</p>
      ) : empty || tracks.length === 0 ? (
        <p className="mt-8 text-center text-sm text-white/40">
          Charts launching soon.
        </p>
      ) : (
        <ol className="mt-4 space-y-0">
          {tracks.map((t, i) => {
            const rank = i + 1;
            return (
              <li
                key={t.id}
                className="flex items-center gap-3 border-b border-white/[0.04] py-3 last:border-0"
              >
                <span
                  className={`w-6 text-center text-sm font-bold tabular-nums ${
                    rank === 1
                      ? "text-[#F5A623]"
                      : rank === 2
                        ? "text-white/55"
                        : rank === 3
                          ? "text-[#A07040]"
                          : "text-white/30"
                  }`}
                >
                  {rank}
                </span>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1DB954]/20 text-xs font-bold text-[#1DB954]">
                  {trackTitle(t).slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {trackTitle(t)}
                  </p>
                  <p className="truncate text-xs text-white/40">
                    {trackArtist(t)}
                    {t.genre ? ` · ${t.genre}` : ""}
                  </p>
                </div>
                <span className="text-xs tabular-nums text-white/35">
                  {formatPlayCount(t.play_count)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export default async function ChartsPage() {
  const supabase = await createClient();
  const rankedRes = await loadRankedTracks(supabase, 40);
  const ranked = rankedRes.ok ? rankedRes.tracks : [];
  const loadError = rankedRes.ok ? null : rankedRes.error;
  const empty = rankedRes.ok && ranked.length === 0;

  const boards = CHART_BOARDS.map((board) => {
    let tracks = [...ranked];
    if ("sort" in board && board.sort === "newest") {
      tracks = tracks.sort(
        (a, b) =>
          (a.created_at || "").localeCompare(b.created_at || "") ||
          b.play_count - a.play_count,
      );
    }
    return {
      ...board,
      tracks: tracks.slice(0, board.limit),
    };
  });

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
            Designated boards for the world — Dakar, the Current, First Light,
            and Alkebulan. Not nested inside Home.
          </p>
        </div>

        {/* Chart switcher */}
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

        {loadError ? (
          <div className="rounded-2xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-6 py-8 text-center text-sm text-[#1DB954]">
            Could not load charts. {loadError}
          </div>
        ) : empty ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-16 text-center">
            <p className="text-lg font-medium">Charts launching soon.</p>
            <p className="mt-2 text-sm text-white/40">
              Boards are ready. Real plays will fill them.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {boards.map((b) => (
              <ChartBoard
                key={b.id}
                title={b.title}
                subtitle={b.subtitle}
                tracks={b.tracks}
                empty={empty}
                error={null}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
