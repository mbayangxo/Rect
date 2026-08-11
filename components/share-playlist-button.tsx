"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SendToFriendPanel } from "@/components/send-to-friend-panel";

type Props = {
  playlistId: string;
  name: string;
  isPublic: boolean;
  /** Owner cover art — required before Share can auto-publish. */
  hasCover?: boolean;
  /** When true, Share will make the playlist public first if needed. */
  isOwner?: boolean;
  compact?: boolean;
  dropUp?: boolean;
  /** Called after visibility flips to public so parents can update local state. */
  onBecamePublic?: () => void;
};

export function SharePlaylistButton({
  playlistId,
  name,
  isPublic,
  hasCover = true,
  isOwner = false,
  compact = false,
  dropUp = false,
  onBecamePublic,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<
    "idle" | "copied" | "error" | "pending"
  >("idle");
  const [publicNow, setPublicNow] = useState(isPublic);
  const [open, setOpen] = useState(false);
  const [friendNote, setFriendNote] = useState<string | null>(null);

  useEffect(() => {
    setPublicNow(isPublic);
  }, [isPublic]);

  async function ensurePublic(): Promise<boolean> {
    if (!isOwner || publicNow) return true;
    if (!hasCover) {
      setFriendNote("Add a cover before sharing publicly.");
      window.setTimeout(() => setFriendNote(null), 4000);
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 2500);
      return false;
    }
    setStatus("pending");
    try {
      const res = await fetch(`/api/playlists/${playlistId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: true }),
      });
      const data = (await res.json()) as {
        error?: string;
        is_public?: boolean;
        became_public?: boolean;
        notified?: number;
      };
      if (!res.ok || data.error) {
        setFriendNote(data.error || "Could not make public");
        window.setTimeout(() => setFriendNote(null), 4000);
        setStatus("error");
        window.setTimeout(() => setStatus("idle"), 2500);
        return false;
      }
      setPublicNow(true);
      onBecamePublic?.();
      router.refresh();
      if (data.became_public) {
        const n = Number(data.notified) || 0;
        setFriendNote(
          n === 0
            ? "Public — friends will see this mix"
            : `Notified ${n} friend${n === 1 ? "" : "s"}`,
        );
        window.setTimeout(() => setFriendNote(null), 4000);
      }
      setStatus("idle");
      return true;
    } catch {
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 2500);
      return false;
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}/playlists/${playlistId}`;
    const title = name;
    const text = `${name} on RECT SOUND`;

    if (isOwner && !publicNow) {
      const ok = await ensurePublic();
      if (!ok) return;
    }

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text, url });
        setStatus("idle");
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setStatus("idle");
        return;
      }
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

  async function openPanel() {
    if (isOwner && !publicNow) {
      const ok = await ensurePublic();
      if (!ok) return;
    }
    setOpen((v) => !v);
  }

  const panel = open ? (
    <div
      className={`absolute right-0 z-30 w-56 rounded-xl border border-white/15 bg-[#071208] p-3 shadow-xl ${
        dropUp ? "bottom-full mb-2" : "mt-2"
      }`}
    >
      {publicNow ? (
        <SendToFriendPanel
          kind="playlist"
          targetId={playlistId}
          loginNext={`/playlists/${playlistId}`}
        />
      ) : (
        <p className="text-xs text-white/45">
          Make the playlist public to send it.
        </p>
      )}
      <button
        type="button"
        disabled={status === "pending"}
        onClick={() => void copyLink()}
        className="mt-2 w-full rounded-lg border border-white/15 px-2 py-1.5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-50"
      >
        {status === "pending"
          ? "Sharing…"
          : status === "copied"
            ? "Link copied"
            : status === "error"
              ? "Copy failed"
              : "Copy link"}
      </button>
      {friendNote ? (
        <p className="mt-2 text-[0.65rem] text-[#1DB954]">{friendNote}</p>
      ) : isOwner && !publicNow ? (
        <p className="mt-2 text-[0.65rem] text-white/40">
          Sharing makes this public — friends who follow you get notified.
        </p>
      ) : null}
    </div>
  ) : null;

  if (compact) {
    return (
      <div className="relative shrink-0">
        <button
          type="button"
          disabled={status === "pending"}
          onClick={() => void openPanel()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-40"
          aria-label={
            isOwner && !publicNow ? "Share (make public)" : "Share playlist"
          }
          title={
            isOwner && !publicNow ? "Share (make public)" : "Share playlist"
          }
        >
          {status === "copied" ? "✓" : status === "error" ? "!" : open ? "×" : "↗"}
        </button>
        {panel}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={status === "pending"}
        onClick={() => void openPanel()}
        className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 disabled:opacity-50"
      >
        {status === "pending"
          ? "Sharing…"
          : open
            ? "Close"
            : isOwner && !publicNow
              ? "Share"
              : "Share"}
      </button>
      {panel}
    </div>
  );
}
