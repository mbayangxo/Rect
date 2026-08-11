"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  personId: string;
  initialFollowing: boolean;
  initialCount: number;
  followsReady: boolean;
  loginNext?: string;
  className?: string;
  /** Hide follower count (e.g. inbox follow-back). */
  showCount?: boolean;
  /** Label when not following. Default "Follow" (becomes "Follow back" if followsYou). */
  idleLabel?: string;
  /** Compact padding for dense lists. */
  compact?: boolean;
  /** They already follow the viewer. */
  followsYou?: boolean;
};

export function PeopleFollowButton({
  personId,
  initialFollowing,
  initialCount,
  followsReady,
  loginNext,
  className = "mt-4",
  showCount = true,
  idleLabel = "Follow",
  compact = false,
  followsYou = false,
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
      const res = await fetch("/api/people/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person_id: personId }),
      });
      const data = (await res.json()) as {
        error?: string;
        following?: boolean;
        follower_count?: number;
      };

      if (res.status === 401) {
        setFollowing(prevFollowing);
        setCount(prevCount);
        const next = loginNext || `/people/${personId}`;
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

  const pad = compact ? "px-3 py-1 text-xs" : "px-5 py-2 text-sm";
  const notFollowingLabel =
    followsYou && idleLabel === "Follow" ? "Follow back" : idleLabel;
  const followingLabel = followsYou ? "Friends" : "Following";

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={!followsReady || pending}
        className={
          following
            ? `rounded-full border border-white/25 bg-white/10 ${pad} font-semibold text-white hover:bg-white/15 disabled:opacity-50`
            : `rounded-full bg-[#1DB954] ${pad} font-semibold text-black hover:bg-[#17a349] disabled:opacity-50`
        }
      >
        {pending ? "…" : following ? followingLabel : notFollowingLabel}
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
      {!followsReady && showCount ? (
        <p className="w-full text-xs text-white/35">
          Run people follows SQL in Supabase to enable Follow.
        </p>
      ) : null}
    </div>
  );
}
