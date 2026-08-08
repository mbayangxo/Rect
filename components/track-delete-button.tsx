"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  trackId: string;
  title: string;
};

export function TrackDeleteButton({ trackId, title }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/tracks/${trackId}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not delete track");
        setPending(false);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setPending(false);
    }
  }

  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        disabled={pending}
        onClick={() => void onDelete()}
        onBlur={() => {
          if (!pending) setConfirming(false);
        }}
        className={`rounded-full px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wide disabled:opacity-50 ${
          confirming
            ? "bg-[#cc2828] text-white hover:bg-[#a82020]"
            : "border border-white/20 text-white/50 hover:border-white/40 hover:text-white/80"
        }`}
        title={confirming ? `Confirm delete “${title}”` : "Delete track"}
      >
        {pending ? "…" : confirming ? "Confirm" : "Delete"}
      </button>
      {error ? (
        <p className="mt-1 max-w-[7rem] text-[0.6rem] text-[#F5A623]">{error}</p>
      ) : null}
    </div>
  );
}
