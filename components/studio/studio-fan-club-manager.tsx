"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FanClubTier } from "@/lib/dashboard/fan-club";

type Props = {
  initialTiers: FanClubTier[];
};

export function StudioFanClubManager({ initialTiers }: Props) {
  const router = useRouter();
  const [tiers, setTiers] = useState(initialTiers);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [perk, setPerk] = useState("");
  const [perks, setPerks] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveTier() {
    if (!name.trim()) {
      setError("Tier name required.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/artist/fan-club", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          price_xof_month: Number(price) || 0,
          perks,
        }),
      });
      const data = (await res.json()) as { error?: string; tier?: FanClubTier };
      if (!res.ok) {
        setError(data.error ?? "Save failed.");
        return;
      }
      if (data.tier) setTiers((list) => [...list, data.tier!]);
      setName("");
      setDescription("");
      setPrice("");
      setPerks([]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-white/45">
        Fan club tiers
      </h2>
      {tiers.length === 0 ? (
        <p className="text-sm text-white/35">No tiers yet — create one for fans to join via JOKO.</p>
      ) : (
        <ul className="space-y-2">
          {tiers.map((t) => (
            <li
              key={t.id}
              className="rounded-lg border border-white/[0.08] px-4 py-3 text-sm"
            >
              <span className="font-medium">{t.name}</span>
              <span className="ml-2 text-[#1DB954]">
                {t.priceXofMonth.toLocaleString()} XOF/mo
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tier name (e.g. Inner Circle)"
          className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
          rows={2}
          className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm"
        />
        <input
          type="number"
          min={0}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Price XOF / month"
          className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <input
            value={perk}
            onChange={(e) => setPerk(e.target.value)}
            placeholder="Perk"
            className="flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              if (perk.trim()) {
                setPerks((p) => [...p, perk.trim()]);
                setPerk("");
              }
            }}
            className="rounded-lg border border-white/15 px-3 text-sm"
          >
            Add
          </button>
        </div>
        {perks.length > 0 ? (
          <ul className="text-xs text-white/50">
            {perks.map((p) => (
              <li key={p}>· {p}</li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <button
          type="button"
          disabled={pending}
          onClick={() => void saveTier()}
          className="rounded-full bg-[#1DB954] px-5 py-2 text-sm font-semibold text-black disabled:opacity-50"
        >
          {pending ? "Saving…" : "Create tier"}
        </button>
      </div>
    </section>
  );
}
