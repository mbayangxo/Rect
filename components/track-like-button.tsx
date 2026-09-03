"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  trackId: string;
  /** When omitted, button fetches like state on mount. */
  initialLiked?: boolean;
  /** When false, hide until parent has like map. Default true if initialLiked omitted (self-fetch). */
  likesReady?: boolean;
  loginNext: string;
  compact?: boolean;
};

export function TrackLikeButton({
  trackId,
  initialLiked,
  likesReady,
  loginNext,
  compact = false,
}: Props) {
  const router = useRouter();
  const selfFetch = initialLiked === undefined;
  const ready = likesReady ?? true;
  const [liked, setLiked] = useState(Boolean(initialLiked));
  const [loaded, setLoaded] = useState(!selfFetch);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!selfFetch) {
      setLiked(Boolean(initialLiked));
      setLoaded(true);
      return;
    }

    let cancelled = false;
    setLoaded(false);
    void (async () => {
      try {
        const res = await fetch(
          `/api/likes?track_id=${encodeURIComponent(trackId)}`,
        );
        if (!res.ok) {
          if (!cancelled) setLoaded(true);
          return;
        }
        const data = (await res.json()) as { liked?: boolean };
        if (!cancelled) {
          setLiked(Boolean(data.liked));
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [trackId, initialLiked, selfFetch]);

  if (!ready || !loaded) return null;

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
      };
      if (res.status === 401) {
        setLiked(prev);
        window.location.href = `/auth/login?next=${encodeURIComponent(loginNext)}`;
        return;
      }
      if (!res.ok || data.error) {
        setLiked(prev);
        return;
      }
      setLiked(Boolean(data.liked));
      router.refresh();
    } catch {
      setLiked(prev);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void toggle()}
      className={
        compact
          ? `shrink-0 rounded-full border px-2 py-1 text-[0.65rem] disabled:opacity-50 ${
              liked
                ? "border-[#1DB954]/40 text-[#1DB954] hover:bg-[#1DB954]/10"
                : "border-white/20 text-white/55 hover:bg-white/10"
            }`
          : `shrink-0 rounded-full border px-2.5 py-1 text-xs disabled:opacity-50 ${
              liked
                ? "border-[#1DB954]/40 text-[#1DB954] hover:bg-[#1DB954]/10"
                : "border-white/20 text-white/70 hover:bg-white/10"
            }`
      }
      aria-label={liked ? "Unlike" : "Like"}
    >
      {liked ? "Liked" : "Like"}
    </button>
  );
}
