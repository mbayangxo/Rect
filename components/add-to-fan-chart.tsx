"use client";

import Link from "next/link";
import { useState } from "react";

type Props = {
  trackId: string;
  compact?: boolean;
  loginNext?: string;
};

export function AddToFanChart({ trackId, compact = false, loginNext }: Props) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);

  const nextPath = loginNext || `/songs/${trackId}`;

  async function add() {
    setPending(true);
    setError(null);
    setMessage(null);
    setNeedsAuth(false);
    try {
      const res = await fetch("/api/fan-charts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_id: trackId }),
      });
      const data = (await res.json()) as { error?: string; ok?: boolean };
      if (res.status === 401) {
        setNeedsAuth(true);
        return;
      }
      if (!res.ok || data.error) {
        setError(data.error ?? "Could not add to chart.");
        return;
      }
      setMessage("Added to your chart.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  if (needsAuth) {
    return (
      <Link
        href={`/auth/login?next=${encodeURIComponent(nextPath)}`}
        className={
          compact
            ? "text-xs text-[#1DB954] hover:underline"
            : "mt-3 inline-block text-sm text-[#1DB954] hover:underline"
        }
      >
        Sign in to add to your chart
      </Link>
    );
  }

  return (
    <div className={compact ? "inline-flex flex-col" : "mt-3"}>
      <button
        type="button"
        disabled={pending}
        onClick={() => void add()}
        className={
          compact
            ? "rounded-full border border-white/15 px-2.5 py-1 text-[0.65rem] font-medium text-white/55 hover:border-[#1DB954]/40 hover:text-[#1DB954] disabled:opacity-50"
            : "rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/70 hover:border-[#1DB954]/40 hover:text-[#1DB954] disabled:opacity-50"
        }
      >
        {pending ? "Adding…" : compact ? "+ My chart" : "Add to my chart"}
      </button>
      {error ? (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      ) : message ? (
        <p className="mt-1 text-xs text-[#1DB954]">
          {message}{" "}
          <Link href="/charts/my" className="underline">
            View chart
          </Link>
        </p>
      ) : null}
    </div>
  );
}
