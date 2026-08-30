"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PlayPack } from "@/lib/dashboard/play-packs";
import type { PendingPackPurchase } from "@/lib/dashboard/credits";
import {
  publishCreditsRemaining,
  subscribeCreditsRemaining,
} from "@/lib/credits-live";

type Props = {
  packs: PlayPack[];
  country: string;
  initialCredits: number;
  creditsReady: boolean;
  initialPending?: PendingPackPurchase[];
};

export function PlayPacksPanel({
  packs,
  country,
  initialCredits,
  creditsReady,
  initialPending = [],
}: Props) {
  const router = useRouter();
  const [credits, setCredits] = useState(initialCredits);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [pending, setPending] = useState(initialPending);
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
    setPending(initialPending);
  }, [initialPending]);

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
        status?: string;
        purchase_id?: number;
        credits_granted?: number;
        credits_pending?: number;
        balance?: number | null;
        pack_name?: string;
        pack_code?: string;
        price_label?: string | null;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Could not start pack purchase");
        return;
      }

      if (data.status === "confirmed") {
        if (typeof data.balance === "number") {
          setCredits(data.balance);
          publishCreditsRemaining(data.balance);
        }
        setMessage(
          `Added ${data.credits_granted ?? 0} plays${
            data.pack_name ? ` from ${data.pack_name}` : ""
          }.`,
        );
      } else if (data.purchase_id != null) {
        const row: PendingPackPurchase = {
          id: data.purchase_id,
          pack_id: Number(pack.id),
          credits_pending: data.credits_pending ?? pack.play_credits ?? 0,
          pack_code: data.pack_code ?? pack.code,
          pack_name: data.pack_name ?? pack.name,
          price_label: data.price_label ?? pack.price_label,
          created_at: new Date().toISOString(),
        };
        setPending((list) => [row, ...list.filter((p) => p.id !== row.id)]);
        setMessage(
          `Payment pending for ${data.pack_name || pack.name}. Confirm demo payment to add credits.`,
        );
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBuyingId(null);
    }
  }

  async function confirm(purchaseId: number) {
    setConfirmingId(purchaseId);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/play-packs/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchase_id: purchaseId }),
      });
      const data = (await res.json()) as {
        error?: string;
        credits_granted?: number;
        balance?: number | null;
        pack_name?: string;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Could not confirm payment");
        return;
      }
      if (typeof data.balance === "number") {
        setCredits(data.balance);
        publishCreditsRemaining(data.balance);
      }
      setPending((list) => list.filter((p) => p.id !== purchaseId));
      setMessage(
        `Payment confirmed — added ${data.credits_granted ?? 0} plays${
          data.pack_name ? ` from ${data.pack_name}` : ""
        }.`,
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setConfirmingId(null);
    }
  }

  async function cancel(purchaseId: number) {
    setConfirmingId(purchaseId);
    setError(null);
    try {
      const res = await fetch("/api/play-packs/confirm", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchase_id: purchaseId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not cancel purchase");
        return;
      }
      setPending((list) => list.filter((p) => p.id !== purchaseId));
      setMessage("Pending purchase cancelled.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setConfirmingId(null);
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

      <p className="mb-3 px-0 text-xs text-white/40">
        Buy starts a pending purchase. Confirm demo payment to add credits — no
        real charge yet.
      </p>

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

      {pending.length > 0 ? (
        <div className="mb-4 space-y-2 px-0">
          {pending.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/[0.06] px-3 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-white/90">
                    Pending · {p.pack_name || p.pack_code || "Pack"}
                  </p>
                  <p className="text-xs text-white/45">
                    {p.credits_pending} plays
                    {p.price_label ? ` · ${p.price_label}` : ""} · demo payment
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={confirmingId === p.id}
                    onClick={() => void confirm(p.id)}
                    className="rounded-full bg-[#1DB954] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
                  >
                    {confirmingId === p.id ? "…" : "Confirm demo pay"}
                  </button>
                  <button
                    type="button"
                    disabled={confirmingId === p.id}
                    onClick={() => void cancel(p.id)}
                    className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/70 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
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
              {buyingId === p.id ? "Starting…" : "Buy pack"}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
