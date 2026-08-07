"use client";

import { usePlayer } from "@/components/player-provider";
import {
  formatPlayCount,
  trackArtist,
  trackTitle,
  type RankedTrack,
} from "@/lib/dashboard/tracks";

export function ChartTrackRow({
  track,
  rank,
}: {
  track: RankedTrack;
  rank: number;
}) {
  const player = usePlayer();
  const canPlay = Boolean(track.audio_url);

  return (
    <li className="flex items-center gap-3 border-b border-white/[0.04] py-3 last:border-0">
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
      <button
        type="button"
        disabled={!canPlay}
        onClick={() => {
          if (track.audio_url) player.play(track);
        }}
        className="flex min-w-0 flex-1 items-center gap-3 text-left transition hover:opacity-90 disabled:opacity-40"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1DB954]/20 text-xs font-bold text-[#1DB954]">
          {trackTitle(track).slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {trackTitle(track)}
          </span>
          <span className="block truncate text-xs text-white/40">
            {trackArtist(track)}
            {track.genre ? ` · ${track.genre}` : ""}
          </span>
        </span>
        {canPlay ? (
          <span className="text-xs text-[#1DB954]" aria-hidden>
            ▶
          </span>
        ) : null}
      </button>
      <span className="text-xs tabular-nums text-white/35">
        {formatPlayCount(track.play_count)}
      </span>
    </li>
  );
}
