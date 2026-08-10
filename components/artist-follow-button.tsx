"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  artistId: string;
  initialFollowing: boolean;
  initialCount: number;
  followsReady: boolean;
  /** Where to return after login (defaults to artist portal). */
  loginNext?: string;
  className?: string;
  /** Hide follower count (e.g. search cards). */
  showCount?: boolean;
  /** Compact padding for dense lists. */
  compact?: boolean;
};

export function ArtistFollowButton({
  artistId,
  initialFollowing,
  initialCount,
  followsReady,
  loginNext,
  className = "mt-5",
  showCount = true,
  compact = false,
}: Props) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (!followsReady || pending) return;
    setError(null);
    setPending(true);
    const prevFollowing = following;
    const prevCount = count;
    setFollowing(!prevFollowing);
    setCount(Math.max(0, prevCount + (prevFollowing ? -1 : 1)));

    try {
      const res = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist_id: artistId }),
      });
      const data = (await res.json()) as {
        error?: string;
        following?: boolean;
        follower_count?: number;
        authenticated?: boolean;
      };

      if (res.status === 401) {
        setFollowing(prevFollowing);
        setCount(prevCount);
        const next = loginNext || `/artists/${artistId}`;
        window.location.href = `/auth/login?next=${encodeURIComponent(next)}`;
        return;
      }

      if (!res.ok || data.error) {
        setFollowing(prevFollowing);
        setCount(prevCount);
        setError(data.error || "Could not update follow");
        return;
      }

      setFollowing(Boolean(data.following));
      if (typeof data.follower_count === "number") {
        setCount(data.follower_count);
      }
      router.refresh();
    } catch (e) {
      setFollowing(prevFollowing);
      setCount(prevCount);
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  const pad = compact ? "px-3 py-1.5 text-xs" : "px-5 py-2 text-sm";

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <button
        type="button"
        onClick={toggle}
        disabled={!followsReady || pending}
        className={
          following
            ? `rounded-full border border-white/25 bg-white/10 ${pad} font-semibold text-white hover:bg-white/15 disabled:opacity-50`
            : `rounded-full bg-[#1DB954] ${pad} font-semibold text-black hover:bg-[#17a349] disabled:opacity-50`
        }
      >
        {pending ? "…" : following ? "Following" : "Follow"}
      </button>
      {showCount ? (
        <p className="text-sm text-white/45">
          {count.toLocaleString()}{" "}
          {count === 1 ? "follower" : "followers"}
        </p>
      ) : null}
      {error ? (
        <p className="w-full text-sm text-[#1DB954]" role="alert">
          {error}
        </p>
      ) : null}
      {!followsReady ? (
        <p className="w-full text-xs text-white/35">
          {showCount
            ? "Run artist follows SQL in Supabase to enable Follow."
            : "Follow unavailable"}
        </p>
      ) : null}
    </div>
  );
}
