"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  trackId: string;
  status: string | null | undefined;
  /** Highlight after upload redirect */
  emphasize?: boolean;
};

export function TrackPublishToggle({
  trackId,
  status,
  emphasize = false,
}: Props) {
  const router = useRouter();
  const published =
    (status || "published").toLowerCase() !== "pending" &&
    (status || "").toLowerCase() !== "draft" &&
    (status || "").toLowerCase() !== "unpublished";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(
    emphasize && !published
      ? "Publish to notify your followers"
      : null,
  );
  const [live, setLive] = useState(published);

  async function toggle() {
    setPending(true);
    setError(null);
    setNote(null);
    const next = live ? "pending" : "live";
    try {
      const res = await fetch(`/api/tracks/${trackId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = (await res.json()) as {
        error?: string;
        notified?: number;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Could not update status");
        return;
      }
      setLive(next === "live");
      if (next === "live") {
        const n = Number(data.notified) || 0;
        setNote(
          n === 0
            ? "Live — no followers to notify yet"
            : `Live — notified ${n} follower${n === 1 ? "" : "s"}`,
        );
      } else {
        setNote("Back to draft");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        disabled={pending}
        onClick={() => void toggle()}
        className={`rounded-full px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wide disabled:opacity-50 ${
          live
            ? "border border-[#1DB954]/40 text-[#1DB954]"
            : emphasize
              ? "bg-[#1DB954] text-black ring-2 ring-[#1DB954]/50 ring-offset-2 ring-offset-[#040d06]"
              : "bg-[#1DB954] text-black"
        }`}
      >
        {pending ? "…" : live ? "Unpublish" : "Publish"}
      </button>
      <p className="mt-1 text-[0.55rem] uppercase tracking-[0.12em] text-white/35">
        {live ? "Live" : "Draft"}
      </p>
      {note ? (
        <p className="mt-1 max-w-[9.5rem] text-[0.6rem] leading-snug text-[#1DB954]">
          {note}
        </p>
      ) : null}
      {error ? <p className="mt-1 text-[0.6rem] text-[#F5A623]">{error}</p> : null}
    </div>
  );
}
