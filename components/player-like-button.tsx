"use client";

import { useEffect, useState } from "react";

type Props = {
  trackId: string;
};

export function PlayerLikeButton({ trackId }: Props) {
  const [liked, setLiked] = useState(false);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setLiked(false);
    void (async () => {
      try {
        const res = await fetch(
          `/api/likes?track_id=${encodeURIComponent(trackId)}`,
        );
        const data = (await res.json()) as { liked?: boolean };
        if (!cancelled && res.ok) {
          setLiked(Boolean(data.liked));
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  async function toggle() {
    if (pending) return;
    setPending(true);
    const prev = liked;
    setLiked(!prev);
    try {
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_id: trackId }),
      });
      const data = (await res.json()) as {
        error?: string;
        liked?: boolean;
        authenticated?: boolean;
      };
      if (res.status === 401) {
        setLiked(prev);
        window.location.href = `/auth/login?next=/songs/${trackId}`;
        return;
      }
      if (!res.ok || data.error) {
        setLiked(prev);
        return;
      }
      setLiked(Boolean(data.liked));
    } catch {
      setLiked(prev);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={pending || !ready}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base disabled:opacity-40 ${
        liked
          ? "text-[#1DB954] hover:bg-[#1DB954]/15"
          : "text-white/55 hover:bg-white/10 hover:text-white"
      }`}
      aria-label={liked ? "Unlike" : "Like"}
      title={liked ? "Unlike" : "Like"}
    >
      {liked ? "♥" : "♡"}
    </button>
  );
}
