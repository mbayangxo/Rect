"use client";

import Link from "next/link";
import { usePlayer } from "@/components/player-provider";
import { trackArtist, trackTitle, type TrackRow } from "@/lib/tracks";

export function TrackList({ tracks }: { tracks: TrackRow[] }) {
  const { track: current, playing, play, toggle } = usePlayer();

  return (
    <ul className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
      {tracks.map((t, i) => {
        const active = current?.id === t.id;
        const canPlay = Boolean(t.audio_url);
        return (
          <li
            key={t.id}
            className={`flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 last:border-b-0 ${
              active ? "bg-[#1DB954]/10" : "hover:bg-white/[0.04]"
            }`}
          >
            <span className="w-6 shrink-0 text-center text-xs tabular-nums text-white/35">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <Link
                href={`/songs/${t.id}`}
                className="block truncate text-sm font-medium text-white hover:underline"
              >
                {trackTitle(t)}
              </Link>
              <p className="truncate text-xs text-white/45">
                {trackArtist(t)}
                {t.genre ? ` · ${t.genre}` : ""}
              </p>
            </div>
            <button
              type="button"
              disabled={!canPlay}
              title={
                canPlay
                  ? `Play ${trackTitle(t)}`
                  : "No audio file on this track yet"
              }
              onClick={() => {
                if (!canPlay) return;
                if (active) toggle();
                else play(t);
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1DB954] text-black transition enabled:hover:bg-[#17a349] disabled:cursor-not-allowed disabled:bg-[#1DB954]/30 disabled:text-black/40"
              aria-label={
                active && playing
                  ? `Pause ${trackTitle(t)}`
                  : `Play ${trackTitle(t)}`
              }
            >
              {active && playing ? "❚❚" : "▶"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
