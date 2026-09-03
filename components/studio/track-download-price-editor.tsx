"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  trackId: string;
  initialPriceXof: number | null;
};

export function TrackDownloadPriceEditor({
  trackId,
  initialPriceXof,
}: Props) {
  const router = useRouter();
  const [price, setPrice] = useState(
    initialPriceXof != null && initialPriceXof > 0 ? String(initialPriceXof) : "",
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const raw = price.trim();
    const download_price_xof =
      raw === "" ? 0 : Math.max(0, Math.round(Number(raw) || 0));

    try {
      const res = await fetch(`/api/tracks/${trackId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ download_price_xof }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Could not save price.");
        return;
      }
      setMessage(
        download_price_xof > 0
          ? `Download price set — ${download_price_xof.toLocaleString()} XOF`
          : "Free download (streaming always free).",
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <label className="block min-w-[7rem]">
        <span className="text-[0.65rem] text-white/40">Download price (XOF)</span>
        <input
          type="number"
          min={0}
          step={1}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Free"
          className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-xs outline-none focus:border-[#1DB954]/50"
        />
      </label>
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="rounded-full border border-white/15 px-3 py-1.5 text-[0.65rem] text-white/70 hover:border-[#1DB954]/40 disabled:opacity-50"
      >
        {saving ? "…" : "Save"}
      </button>
      {message ? (
        <span className="text-[0.65rem] text-[#1DB954]">{message}</span>
      ) : null}
      {error ? (
        <span className="text-[0.65rem] text-[#F5A623]">{error}</span>
      ) : null}
    </div>
  );
}
