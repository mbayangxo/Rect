"use client";

import { useState } from "react";
import type { FanClubTier } from "@/lib/dashboard/fan-club";
import {
  JOKO_PAYMENT_METHODS,
  type JokoPaymentMethodId,
} from "@/lib/joko/payments";

type Props = {
  artistId: string;
  tiers: FanClubTier[];
  isOwner: boolean;
};

export function FanClubPanel({ artistId: _artistId, tiers, isOwner }: Props) {
  const [paymentMethod, setPaymentMethod] =
    useState<JokoPaymentMethodId>("wave");
  const [phone, setPhone] = useState("");
  const [payingTier, setPayingTier] = useState<number | null>(null);
  const [activeMembership, setActiveMembership] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (tiers.length === 0) {
    return (
      <section
        id="fan-club"
        className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-5"
      >
        <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
          Fan club
        </h2>
        <p className="mt-2 text-sm text-white/45">
          {isOwner
            ? "Create fan club tiers in Studio to unlock members-only Live Rooms."
            : "This artist hasn’t opened a fan club yet."}
        </p>
      </section>
    );
  }

  const phoneOk = phone.trim().length >= 8;

  async function join(tierId: number) {
    if (!phoneOk) {
      setError("Enter your mobile money number first.");
      return;
    }
    setPayingTier(tierId);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/fan-club/${tierId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_method: paymentMethod, phone }),
      });
      const data = (await res.json()) as {
        error?: string;
        status?: string;
        tier_name?: string;
        checkout_url?: string | null;
        skipped?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Payment failed.");
        return;
      }
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      if (data.status === "confirmed" || data.status === "active") {
        setActiveMembership(tierId);
        setMessage(
          data.skipped === "already_active"
            ? `You're already in ${data.tier_name ?? "this tier"}.`
            : `Welcome to ${data.tier_name ?? "the fan club"}!`,
        );
        return;
      }
      setMessage("Payment pending — JOKO will confirm shortly.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPayingTier(null);
    }
  }

  return (
    <section
      id="fan-club"
      className="mt-8 rounded-xl border border-[#1DB954]/25 bg-[#1DB954]/5 p-5"
    >
      <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold text-[#1DB954]">
        Fan club
      </h2>
      <p className="mt-1 text-sm text-white/45">
        Join {isOwner ? "your" : "the artist's"} fan club — paid monthly through
        JOKO.
      </p>

      {!isOwner ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {JOKO_PAYMENT_METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setPaymentMethod(m.id)}
                className={`rounded-full px-3 py-1.5 text-xs ${
                  paymentMethod === m.id
                    ? "bg-[#1DB954] text-black"
                    : "border border-white/15 text-white/55"
                }`}
              >
                {m.shortLabel}
              </button>
            ))}
          </div>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Mobile money number"
            className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm"
          />
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {message ? <p className="text-sm text-[#1DB954]">{message}</p> : null}
        </div>
      ) : null}

      <ul className="mt-4 space-y-3">
        {tiers.map((tier) => {
          const isMember = activeMembership === tier.id;
          return (
            <li
              key={tier.id}
              className="rounded-lg border border-white/[0.08] bg-black/20 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{tier.name}</p>
                  {tier.description ? (
                    <p className="mt-0.5 text-sm text-white/45">
                      {tier.description}
                    </p>
                  ) : null}
                  {tier.perks.length > 0 ? (
                    <ul className="mt-2 text-xs text-white/50">
                      {tier.perks.map((p) => (
                        <li key={p}>· {p}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <p className="text-sm font-semibold tabular-nums text-[#1DB954]">
                  {tier.priceXofMonth.toLocaleString()} XOF/mo
                </p>
              </div>
              {!isOwner ? (
                isMember ? (
                  <p className="mt-3 text-xs font-medium text-[#1DB954]">
                    Active membership
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={payingTier != null || !phoneOk}
                    onClick={() => void join(tier.id)}
                    className="mt-3 rounded-full bg-[#1DB954] px-4 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
                  >
                    {payingTier === tier.id
                      ? "Processing…"
                      : !phoneOk
                        ? "Enter phone above"
                        : `Join ${tier.name}`}
                  </button>
                )
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
