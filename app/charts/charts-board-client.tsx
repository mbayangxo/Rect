"use client";

import Link from "next/link";
import { ChartTrackRow } from "@/app/charts/chart-track-row";
import { usePlayer } from "@/components/player-provider";
import type { RankedTrack } from "@/lib/dashboard/tracks";

export function ChartBoard({
  title,
  subtitle,
  tracks,
  emptyHint,
  placeHref,
  error,
  likedTracks = {},
  likesReady = false,
}: {
  title: string;
  subtitle: string;
  tracks: RankedTrack[];
  emptyHint: string;
  placeHref?: string;
  error: string | null;
  likedTracks?: Record<string, boolean>;
  likesReady?: boolean;
}) {
  const player = usePlayer();
  const playable = tracks.filter((t) => Boolean(t.audio_url));

  return (
    <section
      id={title.toLowerCase().replace(/\s+/g, "-")}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold tracking-tight text-[#1DB954] sm:text-xl">
            {title}
          </h2>
          <p className="mt-1 text-xs text-white/40 sm:text-sm">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          {playable.length > 0 ? (
            <button
              type="button"
              onClick={() => player.playQueue(playable, 0)}
              className="rounded-full bg-[#1DB954] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#17a349]"
            >
              ▶ Play all
            </button>
          ) : null}
          <span className="text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-white/30">
            RECT Charts
          </span>
        </div>
      </div>

      {error ? (
        <p className="mt-6 text-center text-sm text-[#1DB954]">{error}</p>
      ) : tracks.length === 0 ? (
        <div className="mt-8 space-y-3 text-center">
          <p className="text-sm text-white/40">{emptyHint}</p>
          {placeHref ? (
            <Link
              href={placeHref}
              className="inline-block text-xs text-[#1DB954] hover:underline"
            >
              Open place hub →
            </Link>
          ) : null}
        </div>
      ) : (
        <ol className="mt-4 space-y-0">
          {tracks.map((t, i) => (
            <ChartTrackRow
              key={t.id}
              track={t}
              rank={i + 1}
              queue={playable}
              initialLiked={Boolean(likedTracks[t.id])}
              likesReady={likesReady}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
