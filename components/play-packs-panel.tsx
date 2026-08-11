"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PlayPack } from "@/lib/dashboard/play-packs";
import {
  publishCreditsRemaining,
  subscribeCreditsRemaining,
} from "@/lib/credits-live";

type Props = {
  packs: PlayPack[];
  country: string;
  initialCredits: number;
  creditsReady: boolean;
};

export function PlayPacksPanel({
  packs,
  country,
  initialCredits,
  creditsReady,
}: Props) {
  const router = useRouter();
  const [credits, setCredits] = useState(initialCredits);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCredits(initialCredits);
  }, [initialCredits]);

  useEffect(() => {
    if (creditsReady) {
      publishCreditsRemaining(initialCredits);
    }
  }, [creditsReady, initialCredits]);

  useEffect(() => {
    return subscribeCreditsRemaining(setCredits);
  }, []);

  async function buy(pack: PlayPack) {
    setBuyingId(pack.id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/play-packs/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack_id: pack.id }),
      });
      const data = (await res.json()) as {
        error?: string;
        credits_granted?: number;
        balance?: number;
        pack_name?: string;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Could not buy pack");
        return;
      }
      if (typeof data.balance === "number") {
        setCredits(data.balance);
        publishCreditsRemaining(data.balance);
      }
      setMessage(
        `Added ${data.credits_granted ?? 0} plays${
          data.pack_name ? ` from ${data.pack_name}` : ""
        }.`,
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBuyingId(null);
    }
  }

  return (
    <>
      <div className="dash-sh px-0">
        <span className="dash-sh-t">Play packs · {country}</span>
        {creditsReady ? (
          <span className="dash-sh-m tabular-nums text-[#1DB954]">
            {credits} credits
          </span>
        ) : (
          <span className="dash-sh-m text-white/35">Credits offline</span>
        )}
      </div>

      {!creditsReady ? (
        <p className="mb-3 px-0 text-xs text-white/40">
          Run the play credits SQL in Supabase to enable buying packs.
        </p>
      ) : null}

      {message ? (
        <p className="mb-3 px-0 text-xs text-[#1DB954]">{message}</p>
      ) : null}
      {error ? (
        <p className="mb-3 px-0 text-xs text-[#F5A623]">{error}</p>
      ) : null}

      <div className="dash-packs grid gap-3 px-0 sm:grid-cols-3">
        {packs.map((p) => (
          <div key={p.id} className="dash-pack">
            <div className="dash-pack-code">{p.code}</div>
            <div className="dash-pack-name">{p.name}</div>
            {p.description ? (
              <p className="dash-pack-desc">{p.description}</p>
            ) : null}
            <div className="dash-pack-meta">
              {p.price_label ? <span>{p.price_label}</span> : null}
              {p.play_credits != null ? (
                <span>{p.play_credits} plays</span>
              ) : null}
            </div>
            <button
              type="button"
              disabled={!creditsReady || buyingId === p.id}
              onClick={() => void buy(p)}
              className="dash-pack-buy"
            >
              {buyingId === p.id ? "Adding…" : "Get pack"}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
