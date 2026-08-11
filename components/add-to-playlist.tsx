"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PlaylistSummary } from "@/lib/dashboard/playlists";

type Props = {
  trackId: string;
  /** Compact control for list rows (library, charts). */
  compact?: boolean;
  /** Open the picker upward (player bar). */
  dropUp?: boolean;
  /** Login return path when unauthenticated. */
  loginNext?: string;
};

export function AddToPlaylist({
  trackId,
  compact = false,
  dropUp = false,
  loginNext,
}: Props) {
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [missingTable, setMissingTable] = useState(false);

  const nextPath = loginNext || `/songs/${trackId}`;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessage(null);
    setNeedsAuth(false);
    setMissingTable(false);
    void (async () => {
      try {
        const res = await fetch("/api/playlists");
        const data = (await res.json()) as {
          error?: string;
          code?: string;
          playlists?: PlaylistSummary[];
          authenticated?: boolean;
        };
        if (cancelled) return;
        if (res.status === 401) {
          setNeedsAuth(true);
          return;
        }
        if (res.status === 503 || data.code === "missing_table") {
          setMissingTable(true);
          return;
        }
        if (!res.ok || data.error) {
          setError(data.error || "Could not load playlists");
          return;
        }
        setPlaylists(data.playlists ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Network error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function addTo(playlistId: string) {
    setPendingId(playlistId);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_id: trackId }),
      });
      const data = (await res.json()) as {
        error?: string;
        added?: boolean;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Could not add track");
        return;
      }
      setMessage(data.added === false ? "Already in that playlist" : "Added");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPendingId(null);
    }
  }

  const panel = open ? (
    <div
      className={
        compact
          ? `absolute right-0 z-30 w-56 rounded-xl border border-white/15 bg-[#071208] p-3 shadow-xl ${
              dropUp ? "bottom-full mb-2" : "mt-2"
            }`
          : "mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-3"
      }
    >
      {needsAuth ? (
        <p className="text-sm text-white/50">
          <Link
            href={`/auth/login?next=${encodeURIComponent(nextPath)}`}
            className="text-[#1DB954] hover:underline"
          >
            Sign in
          </Link>{" "}
          to save playlists.
        </p>
      ) : null}
      {missingTable ? (
        <p className="text-sm text-white/45">
          Run playlists SQL in Supabase first.
        </p>
      ) : null}
      {loading ? <p className="text-sm text-white/40">Loading…</p> : null}
      {!loading && !needsAuth && !missingTable && playlists.length === 0 ? (
        <p className="text-sm text-white/45">
          No playlists yet.{" "}
          <Link href="/playlists" className="text-[#1DB954] hover:underline">
            Create one
          </Link>
        </p>
      ) : null}
      {playlists.length > 0 ? (
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {playlists.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={pendingId === p.id}
                onClick={() => addTo(p.id)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-white/[0.06] disabled:opacity-50"
              >
                <span className="truncate">
                  {p.name}
                  {p.role === "collaborator" ? (
                    <span className="text-white/35"> · collab</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-white/35">
                  {pendingId === p.id ? "…" : "Add"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {message ? (
        <p className="mt-2 text-xs text-[#1DB954]">{message}</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-[#1DB954]" role="alert">
          {error}
        </p>
      ) : null}
      <Link
        href="/playlists"
        className="mt-3 inline-block text-xs text-white/40 hover:text-[#1DB954]"
      >
        Manage playlists →
      </Link>
    </div>
  ) : null;

  if (compact) {
    return (
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-white/20 px-2.5 py-1 text-xs text-white/55 hover:bg-white/10 hover:text-white"
          aria-label={open ? "Close add to playlist" : "Add to playlist"}
          title="Add to playlist"
        >
          {open ? "×" : "+"}
        </button>
        {panel}
      </div>
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10"
      >
        {open ? "Close" : "Add to playlist"}
      </button>
      {panel}
    </div>
  );
}
