"use client";

import { usePlayer } from "@/components/player-provider";
import type { TrackRow } from "@/lib/tracks";

type Props = {
  track: TrackRow | null;
  className?: string;
};

/** Play/pause only — for own-catalog tips where Like/Follow-self don’t apply. */
export function InboxTrackPlay({ track, className = "" }: Props) {
  const player = usePlayer();
  if (!track?.audio_url) return null;

  const active = player.track?.id === track.id;
  const playing = active && player.playing;

  return (
    <button
      type="button"
      onClick={() => {
        if (active && player.playing) {
          player.toggle();
          return;
        }
        player.play(track);
      }}
      className={
        className ||
        "mt-2 rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
      }
      title={playing ? "Pause" : "Play"}
    >
      {playing ? "Pause" : "Play"}
    </button>
  );
}
