"use client";

import Link from "next/link";
import { useState } from "react";
import { SendToFriendPanel } from "@/components/send-to-friend-panel";
import { trackArtist, trackTitle, type TrackRow } from "@/lib/tracks";

type Props = {
  track: TrackRow;
  compact?: boolean;
  dropUp?: boolean;
  loginNext?: string;
};

function recordCardEvent(
  trackId: string,
  eventType: "share" | "copy_link" | "send_friend",
  channel?: string,
) {
  void fetch("/api/listening-card/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      track_id: trackId,
      event_type: eventType,
      channel: channel ?? "share_button",
    }),
  }).catch(() => {});
}

export function ShareTrackButton({
  track,
  compact = false,
  dropUp = false,
  loginNext,
}: Props) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const [open, setOpen] = useState(false);

  const cardUrl = () =>
    `${window.location.origin}/songs/${track.id}/card`;

  async function copyLink() {
    const url = cardUrl();
    const title = trackTitle(track);
    const text = `${title} — ${trackArtist(track)} on RECT SOUND`;

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text, url });
        recordCardEvent(track.id, "share", "native_share");
        setOpen(false);
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }

    try {
      await navigator.clipboard.writeText(url);
      recordCardEvent(track.id, "copy_link", "clipboard");
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
        loginNext={loginNext || `/songs/${track.id}/card`}
      />
      <button
        type="button"
        onClick={() => void copyLink()}
        className="mt-2 w-full rounded-lg border border-white/15 px-2 py-1.5 text-xs text-white/70 hover:bg-white/10"
      >
        {status === "copied"
          ? "Card link copied"
          : status === "error"
            ? "Copy failed"
            : "Copy listening card"}
      </button>
      <Link
        href={`/songs/${track.id}/card`}
        className="mt-2 block w-full rounded-lg border border-[var(--rect)]/30 px-2 py-1.5 text-center text-xs text-[var(--rect-sand)] hover:bg-[var(--rect)]/10"
        onClick={() => setOpen(false)}
      >
        Open listening card
      </Link>
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
        {open ? "Close" : "Share card"}
      </button>
      {panel}
    </div>
  );
}
