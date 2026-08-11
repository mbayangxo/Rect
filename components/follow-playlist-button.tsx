"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  playlistId: string;
  initialFollowing?: boolean;
  initialCount?: number;
  followsReady?: boolean;
  loginNext?: string;
  compact?: boolean;
  className?: string;
  /** Fetch follow state on mount (search cards). */
  hydrate?: boolean;
};

export function FollowPlaylistButton({
  playlistId,
  initialFollowing = false,
  initialCount = 0,
  followsReady = true,
  loginNext,
  compact = false,
  className = "",
  hydrate = false,
}: Props) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(initialCount);
  const [ready, setReady] = useState(followsReady && !hydrate);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setFollowing(initialFollowing);
    setCount(initialCount);
    if (!hydrate) setReady(followsReady);
  }, [initialFollowing, initialCount, followsReady, hydrate, playlistId]);

  useEffect(() => {
    if (!hydrate) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/playlists/${playlistId}/follow`);
        const data = (await res.json()) as {
          following?: boolean;
          follower_count?: number;
          code?: string;
        };
        if (cancelled) return;
        if (res.status === 503 || data.code === "missing_table") {
          setReady(false);
          return;
        }
        if (res.ok) {
          setFollowing(Boolean(data.following));
          if (typeof data.follower_count === "number") {
            setCount(data.follower_count);
          }
          setReady(true);
        }
      } catch {
        if (!cancelled) setReady(followsReady);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrate, playlistId, followsReady]);

  async function toggle() {
    if (!ready || pending) return;
    const prevFollowing = following;
    const prevCount = count;
    setPending(true);
    setFollowing(!prevFollowing);
    setCount(Math.max(0, prevCount + (prevFollowing ? -1 : 1)));
    try {
      const res = await fetch(`/api/playlists/${playlistId}/follow`, {
        method: "POST",
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
        const next = loginNext || `/playlists/${playlistId}`;
        router.push(`/auth/login?next=${encodeURIComponent(next)}`);
        return;
      }
      if (!res.ok || data.error) {
        setFollowing(prevFollowing);
        setCount(prevCount);
        return;
      }
      setFollowing(Boolean(data.following));
      if (typeof data.follower_count === "number") {
        setCount(data.follower_count);
      }
      router.refresh();
    } catch {
      setFollowing(prevFollowing);
      setCount(prevCount);
    } finally {
      setPending(false);
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        disabled={!ready || pending}
        onClick={() => void toggle()}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs hover:bg-white/10 disabled:opacity-40 ${
          following ? "text-[#1DB954]" : "text-white/55 hover:text-white"
        } ${className}`}
        aria-label={following ? "Unsave playlist" : "Save playlist"}
        title={following ? "Saved" : "Save"}
      >
        {pending ? "…" : following ? "★" : "☆"}
      </button>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={!ready || pending}
        onClick={() => void toggle()}
        className={`rounded-full px-4 py-2.5 text-sm font-medium disabled:opacity-50 ${
          following
            ? "border border-[#1DB954]/50 bg-[#1DB954]/10 text-[#1DB954]"
            : "border border-white/20 text-white/80 hover:bg-white/10"
        }`}
      >
        {pending ? "…" : following ? "Saved" : "Save"}
        {count > 0 ? (
          <span className="ml-1.5 text-xs opacity-70">{count}</span>
        ) : null}
      </button>
      {!ready ? (
        <p className="mt-2 text-xs text-white/35">
          Run playlist follows SQL in Supabase to enable Save.
        </p>
      ) : null}
    </div>
  );
}
