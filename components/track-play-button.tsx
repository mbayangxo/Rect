"use client";

import { usePlayer } from "@/components/player-provider";
import { trackTitle, type TrackRow } from "@/lib/tracks";

export function TrackPlayButton({ track }: { track: TrackRow }) {
  const { track: current, playing, play, toggle } = usePlayer();
  const active = current?.id === track.id;
  const canPlay = Boolean(track.audio_url);

  return (
    <button
      type="button"
      disabled={!canPlay}
      onClick={() => {
        if (!canPlay) return;
        if (active) toggle();
        else play(track);
      }}
      className="rounded-full bg-[#1DB954] px-6 py-3 text-sm font-semibold text-black transition enabled:hover:bg-[#17a349] disabled:cursor-not-allowed disabled:bg-[#1DB954]/30"
    >
      {!canPlay
        ? "No audio"
        : active && playing
          ? "Pause"
          : `Play ${trackTitle(track)}`}
    </button>
  );
}
