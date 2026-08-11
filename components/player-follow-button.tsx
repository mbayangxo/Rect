"use client";

import { useEffect, useState } from "react";

type Props = {
  artistId: string;
  loginNext?: string;
};

export function PlayerFollowButton({ artistId, loginNext }: Props) {
  const [following, setFollowing] = useState(false);
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setFollowing(false);
    setHidden(false);
    void (async () => {
      try {
        const res = await fetch(
          `/api/follows?artist_id=${encodeURIComponent(artistId)}`,
        );
        const data = (await res.json()) as {
          following?: boolean;
          self?: boolean;
          code?: string;
        };
        if (cancelled) return;
        if (res.status === 503 || data.code === "missing_table") {
          setHidden(true);
          return;
        }
        if (data.self) {
          setHidden(true);
          return;
        }
        if (res.ok) {
          setFollowing(Boolean(data.following));
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
  }, [artistId]);

  async function toggle() {
    if (pending || hidden) return;
    setPending(true);
    const prev = following;
    setFollowing(!prev);
    try {
      const res = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist_id: artistId }),
      });
      const data = (await res.json()) as {
        error?: string;
        following?: boolean;
        code?: string;
      };
      if (res.status === 401) {
        setFollowing(prev);
        const next = loginNext || `/artists/${artistId}`;
        window.location.href = `/auth/login?next=${encodeURIComponent(next)}`;
        return;
      }
      if (data.code === "cannot_follow_self") {
        setFollowing(prev);
        setHidden(true);
        return;
      }
      if (!res.ok || data.error) {
        setFollowing(prev);
        return;
      }
      setFollowing(Boolean(data.following));
    } catch {
      setFollowing(prev);
    } finally {
      setPending(false);
    }
  }

  if (hidden) return null;

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={pending || !ready}
      className={`flex h-9 shrink-0 items-center justify-center rounded-full px-2.5 text-[0.55rem] font-semibold uppercase tracking-wide disabled:opacity-40 ${
        following
          ? "border border-white/20 text-white/70 hover:bg-white/10"
          : "bg-[#1DB954]/20 text-[#1DB954] hover:bg-[#1DB954]/30"
      }`}
      aria-label={following ? "Unfollow" : "Follow"}
      title={following ? "Unfollow" : "Follow"}
    >
      {pending ? "…" : following ? "On" : "Fol"}
    </button>
  );
}
