"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  playlistId: string;
  compact?: boolean;
  loginNext?: string;
};

/** Duplicate a public (or own) playlist into the signed-in user's library. */
export function SavePlaylistButton({
  playlistId,
  compact = false,
  loginNext,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");

  async function save() {
    if (status === "saving") return;
    setStatus("saving");
    try {
      const res = await fetch(`/api/playlists/${playlistId}/duplicate`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        error?: string;
        playlist?: { id: string };
        authenticated?: boolean;
      };
      if (res.status === 401) {
        const next =
          loginNext ||
          `/playlists/${playlistId}`;
        router.push(`/auth/login?next=${encodeURIComponent(next)}`);
        return;
      }
      if (!res.ok || data.error || !data.playlist?.id) {
        setStatus("error");
        window.setTimeout(() => setStatus("idle"), 2500);
        return;
      }
      router.push(`/playlists/${data.playlist.id}`);
      router.refresh();
    } catch {
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        disabled={status === "saving"}
        onClick={() => void save()}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-40"
        aria-label={
          status === "saving"
            ? "Copying…"
            : status === "error"
              ? "Could not copy"
              : "Make a copy"
        }
        title={
          status === "saving"
            ? "Copying…"
            : status === "error"
              ? "Could not copy"
              : "Make a copy"
        }
      >
        {status === "saving" ? "…" : status === "error" ? "!" : "↓"}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={status === "saving"}
      onClick={() => void save()}
      className="rounded-full border border-white/20 px-4 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 disabled:opacity-50"
    >
      {status === "saving"
        ? "Copying…"
        : status === "error"
          ? "Could not copy"
          : "Make a copy"}
    </button>
  );
}
