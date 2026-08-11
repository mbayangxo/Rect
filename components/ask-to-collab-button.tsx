"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  playlistId: string;
  collabReady: boolean;
  signedIn: boolean;
  loginNext: string;
  /** Server-backed open ask (durable — survives Mark all read). */
  askPending?: boolean;
  className?: string;
};

export function AskToCollabButton({
  playlistId,
  collabReady,
  signedIn,
  loginNext,
  askPending = false,
  className = "rounded-full border border-white/20 px-4 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 disabled:opacity-50",
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(askPending);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWaiting(askPending);
  }, [askPending]);

  async function ask() {
    if (!collabReady || busy || waiting) return;
    if (!signedIn) {
      window.location.href = `/auth/login?next=${encodeURIComponent(loginNext)}`;
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request" }),
      });
      const data = (await res.json()) as { error?: string; skipped?: string };
      if (res.status === 401) {
        window.location.href = `/auth/login?next=${encodeURIComponent(loginNext)}`;
        return;
      }
      if (!res.ok || data.error) {
        setError(data.error || "Could not ask");
        return;
      }
      setWaiting(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!collabReady || busy || !waiting) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_request" }),
      });
      const data = (await res.json()) as { error?: string; code?: string };
      if (!res.ok || data.error) {
        if (res.status === 503 || data.code === "missing_table") {
          setError("Run durable collab asks SQL to cancel");
          return;
        }
        setError(data.error || "Could not cancel");
        return;
      }
      setWaiting(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  if (!collabReady) return null;

  return (
    <div className="inline-flex flex-col items-start gap-1">
      {waiting ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/20 px-4 py-2.5 text-sm text-white/55">
            Asked
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void cancel()}
            className="rounded-full border border-white/20 px-3 py-2 text-xs text-white/50 hover:bg-white/10 disabled:opacity-50"
          >
            {busy ? "…" : "Cancel"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void ask()}
          className={className}
        >
          {busy ? "…" : signedIn ? "Ask to collab" : "Sign in to ask"}
        </button>
      )}
      {waiting ? (
        <p className="text-xs text-white/40">Waiting for the owner</p>
      ) : null}
      {error ? (
        <p className="text-xs text-[#F5A623]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
