"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  trackId: string;
  initialCount: number;
  initiallyLiked: boolean;
  signedIn: boolean;
};

export function SongLikeControl({
  trackId,
  initialCount,
  initiallyLiked,
  signedIn,
}: Props) {
  const router = useRouter();
  const [liked, setLiked] = useState(initiallyLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (!signedIn) {
      window.location.href = `/auth/login?next=/songs/${trackId}`;
      return;
    }
    if (pending) return;
    setPending(true);
    setError(null);
    const prevLiked = liked;
    const prevCount = count;
    const nextLiked = !prevLiked;
    setLiked(nextLiked);
    setCount(Math.max(0, prevCount + (nextLiked ? 1 : -1)));

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
      if (!res.ok || data.error) {
        setLiked(prevLiked);
        setCount(prevCount);
        setError(data.error || "Could not update like");
        return;
      }
      const confirmed = Boolean(data.liked);
      setLiked(confirmed);
      setCount(Math.max(0, prevCount + (confirmed === prevLiked ? 0 : confirmed ? 1 : -1)));
      router.refresh();
    } catch (e) {
      setLiked(prevLiked);
      setCount(prevCount);
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={pending}
        className={
          liked
            ? "rounded-full bg-[#1DB954]/20 px-4 py-2 text-sm font-semibold text-[#1DB954] hover:bg-[#1DB954]/30 disabled:opacity-50"
            : "rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 disabled:opacity-50"
        }
      >
        {liked ? "♥ Liked" : "♡ Like"}
      </button>
      <p className="text-sm text-white/45">
        {count.toLocaleString()} {count === 1 ? "like" : "likes"}
      </p>
      {error ? (
        <p className="w-full text-sm text-[#1DB954]" role="alert">
          {error}
        </p>
      ) : null}
      {!signedIn ? (
        <Link
          href={`/auth/login?next=/songs/${trackId}`}
          className="text-xs text-white/35 hover:text-[#1DB954]"
        >
          Sign in to like
        </Link>
      ) : null}
    </div>
  );
}
