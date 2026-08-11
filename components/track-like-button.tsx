"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  trackId: string;
  initialLiked: boolean;
  likesReady: boolean;
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
  const [liked, setLiked] = useState(initialLiked);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setLiked(initialLiked);
  }, [initialLiked, trackId]);

  if (!likesReady) return null;

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
