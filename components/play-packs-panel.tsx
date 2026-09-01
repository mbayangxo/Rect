"use client";

import Link from "next/link";
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
        Pay with Wave, Orange Money, MTN MoMo, or local mobile money through JOKO
        — no bank account or card needed.
      </p>

      <Link
        href="/profile/credits"
        className="mb-4 inline-flex rounded-full bg-[#1DB954] px-4 py-2 text-xs font-semibold text-black hover:bg-[#17a349]"
      >
        Add credits · Get play pack
      </Link>

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
                    {p.price_label ? ` · ${p.price_label}` : ""} · awaiting JOKO
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href="/profile/credits"
                    className="rounded-full bg-[#1DB954] px-3 py-1.5 text-xs font-semibold text-black"
                  >
                    Complete pay
                  </Link>
                  <button
                    type="button"
                    disabled={confirmingId === p.id}
                    onClick={() => void confirm(p.id)}
                    className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/70 disabled:opacity-50"
                  >
                    {confirmingId === p.id ? "…" : "Demo confirm"}
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
            <Link
              href="/profile/credits"
              className="dash-pack-buy inline-flex items-center justify-center"
            >
              Get pack
            </Link>
          </div>
        ))}
      </div>
    </>
  );
}
