"use client";

import { useState } from "react";
import { trackArtist, trackTitle, type TrackRow } from "@/lib/tracks";

type Props = {
  track: TrackRow;
  /** Icon-sized control for the player bar / list rows. */
  compact?: boolean;
};

export function ShareTrackButton({ track, compact = false }: Props) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function share() {
    const url = `${window.location.origin}/songs/${track.id}`;
    const title = trackTitle(track);
    const text = `${title} — ${trackArtist(track)} on RECT SOUND`;

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text, url });
        return;
      }
    } catch (e) {
      // User cancelled share sheet — not an error
      if (e instanceof DOMException && e.name === "AbortError") return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  if (compact) {
    const label =
      status === "copied"
        ? "Copied"
        : status === "error"
          ? "Failed"
          : "Share";
    return (
      <button
        type="button"
        onClick={() => void share()}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs text-white/55 hover:bg-white/10 hover:text-white"
        aria-label={label}
        title={label}
      >
        {status === "copied" ? "✓" : status === "error" ? "!" : "↗"}
      </button>
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => void share()}
        className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10"
      >
        {status === "copied"
          ? "Link copied"
          : status === "error"
            ? "Could not copy"
            : "Share"}
      </button>
    </div>
  );
}
