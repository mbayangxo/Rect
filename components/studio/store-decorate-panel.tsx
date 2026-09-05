"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type StoreLayoutId = "grid" | "rail" | "featured";

const LAYOUTS: {
  id: StoreLayoutId;
  label: string;
  hint: string;
}[] = [
  {
    id: "grid",
    label: "Grid",
    hint: "Equal cards — classic shop",
  },
  {
    id: "rail",
    label: "Rail",
    hint: "Horizontal scroll — drop drops",
  },
  {
    id: "featured",
    label: "Featured",
    hint: "Hero first item, rest below",
  },
];

const STARTERS: {
  id: string;
  title: string;
  description: string;
  category: "clothing" | "digital" | "physical";
  music_format?: "album" | "cd" | "vinyl" | null;
  price_xof: number;
}[] = [
  {
    id: "tee",
    title: "Tour tee",
    description: "Soft cotton tee with your World art on the back.",
    category: "clothing",
    price_xof: 12000,
  },
  {
    id: "vinyl",
    title: "Vinyl edition",
    description: "Limited press — links to a catalog track for RECT SCORE.",
    category: "physical",
    music_format: "vinyl",
    price_xof: 25000,
  },
  {
    id: "digital",
    title: "Digital album",
    description: "Instant download pack for fans who want the full drop.",
    category: "digital",
    music_format: "album",
    price_xof: 5000,
  },
];

type Props = {
  layout: StoreLayoutId;
  onLayoutChange: (layout: StoreLayoutId) => void;
  storeReady: boolean;
  catalogTracks: { id: string; title: string }[];
};

/**
 * Decorate store — layout templates + starter merch products.
 */
export function StoreDecoratePanel({
  layout,
  onLayoutChange,
  storeReady,
  catalogTracks,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function applyStarter(starter: (typeof STARTERS)[number]) {
    if (!storeReady || pending) return;
    setPending(starter.id);
    setError(null);
    setMessage(null);
    try {
      const trackId =
        starter.music_format && catalogTracks[0] ? catalogTracks[0].id : null;
      if (starter.music_format && !trackId) {
        setError("Upload a track first, then add vinyl/album starters.");
        return;
      }
      const res = await fetch("/api/artist/merch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: starter.title,
          description: starter.description,
          price_xof: starter.price_xof,
          category: starter.category,
          music_format: starter.music_format ?? null,
          track_id: trackId,
          quantity_available: starter.category === "clothing" ? 50 : null,
          active: false,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not create starter.");
        return;
      }
      setMessage(
        `Draft “${starter.title}” added — add a photo and activate when ready.`,
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-[var(--rect)]">
          Decorate store
        </p>
        <h2 className="mt-1 font-[family-name:var(--font-syne)] text-lg font-semibold">
          Layout template
        </h2>
        <p className="mt-1 text-sm text-white/45">
          How fans see your merch on your World page.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => onLayoutChange(l.id)}
              className={`rounded-xl border px-3 py-3 text-left transition ${
                layout === l.id
                  ? "border-[var(--rect)]/50 bg-[var(--rect)]/10"
                  : "border-white/10 hover:border-white/25"
              }`}
            >
              <span className="block text-sm font-medium">{l.label}</span>
              <span className="mt-1 block text-xs text-white/40">{l.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
          Starter products
        </h2>
        <p className="mt-1 text-sm text-white/45">
          One-tap drafts — inactive until you add photos and go live.
        </p>
        {message ? (
          <p className="mt-3 text-sm text-[var(--rect)]">{message}</p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-[#F5A623]">{error}</p>
        ) : null}
        <ul className="mt-4 grid gap-2 sm:grid-cols-3">
          {STARTERS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                disabled={!storeReady || pending === s.id}
                onClick={() => void applyStarter(s)}
                className="w-full rounded-xl border border-white/10 px-3 py-3 text-left hover:border-[var(--rect)]/35 disabled:opacity-40"
              >
                <span className="block text-sm font-medium">{s.title}</span>
                <span className="mt-1 block text-xs text-white/40">
                  {s.price_xof.toLocaleString()} XOF · draft
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
