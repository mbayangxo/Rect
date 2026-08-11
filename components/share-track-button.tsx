"use client";

import { useState } from "react";
import { SendToFriendPanel } from "@/components/send-to-friend-panel";
import { trackArtist, trackTitle, type TrackRow } from "@/lib/tracks";

type Props = {
  track: TrackRow;
  compact?: boolean;
  dropUp?: boolean;
  loginNext?: string;
};

export function ShareTrackButton({
  track,
  compact = false,
  dropUp = false,
  loginNext,
}: Props) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const [open, setOpen] = useState(false);

  async function copyLink() {
    const url = `${window.location.origin}/songs/${track.id}`;
    const title = trackTitle(track);
    const text = `${title} — ${trackArtist(track)} on RECT SOUND`;

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text, url });
        setOpen(false);
        return;
      }
    } catch (e) {
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

  const panel = open ? (
    <div
      className={`absolute right-0 z-30 w-56 rounded-xl border border-white/15 bg-[#071208] p-3 shadow-xl ${
        dropUp ? "bottom-full mb-2" : "mt-2"
      }`}
    >
      <SendToFriendPanel
        kind="track"
        targetId={track.id}
        loginNext={loginNext || `/songs/${track.id}`}
      />
      <button
        type="button"
        onClick={() => void copyLink()}
        className="mt-2 w-full rounded-lg border border-white/15 px-2 py-1.5 text-xs text-white/70 hover:bg-white/10"
      >
        {status === "copied"
          ? "Link copied"
          : status === "error"
            ? "Copy failed"
            : "Copy link"}
      </button>
    </div>
  ) : null;

  if (compact) {
    const label =
      status === "copied"
        ? "Copied"
        : status === "error"
          ? "Failed"
          : open
            ? "Close share"
            : "Share";
    return (
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-xs text-white/55 hover:bg-white/10 hover:text-white"
          aria-label={label}
          title={label}
        >
          {status === "copied" ? "✓" : status === "error" ? "!" : open ? "×" : "↗"}
        </button>
        {panel}
      </div>
    );
  }

  return (
    <div className="relative mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10"
      >
        {open ? "Close" : "Share"}
      </button>
      {panel}
    </div>
  );
}
