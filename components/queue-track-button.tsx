"use client";

import { useState } from "react";
import { usePlayer } from "@/components/player-provider";
import { trackTitle, type TrackRow } from "@/lib/tracks";

type Props = {
  track: TrackRow;
  /** Icon-sized control for list rows. */
  compact?: boolean;
};

export function QueueTrackButton({ track, compact = false }: Props) {
  const { addToQueue, playNext } = usePlayer();
  const [flash, setFlash] = useState<"idle" | "queued" | "next">("idle");
  const canQueue = Boolean(track.audio_url);

  function flashStatus(next: "queued" | "next") {
    setFlash(next);
    window.setTimeout(() => setFlash("idle"), 1400);
  }

  if (compact) {
    const label =
      flash === "queued"
        ? "Queued"
        : flash === "next"
          ? "Up next"
          : "Add to queue";
    return (
      <button
        type="button"
        disabled={!canQueue}
        onClick={() => {
          if (!canQueue) return;
          addToQueue(track);
          flashStatus("queued");
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!canQueue) return;
          playNext(track);
          flashStatus("next");
        }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-30"
        aria-label={label}
        title={`${label} · right-click = Play next`}
      >
        {flash === "queued" || flash === "next" ? "✓" : "＋"}
      </button>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        disabled={!canQueue}
        onClick={() => {
          if (!canQueue) return;
          addToQueue(track);
          flashStatus("queued");
        }}
        className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 disabled:opacity-40"
      >
        {flash === "queued" ? "Added to queue" : "Add to queue"}
      </button>
      <button
        type="button"
        disabled={!canQueue}
        onClick={() => {
          if (!canQueue) return;
          playNext(track);
          flashStatus("next");
        }}
        className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 disabled:opacity-40"
        aria-label={`Play ${trackTitle(track)} next`}
      >
        {flash === "next" ? "Playing next" : "Play next"}
      </button>
    </div>
  );
}
