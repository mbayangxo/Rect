"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PendingPackPurchase } from "@/lib/dashboard/credits";
import type { PlayPack } from "@/lib/dashboard/play-packs";
import {
  JOKO_PAYMENT_METHODS,
  type JokoPaymentMethodId,
} from "@/lib/joko/payments";
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
  /** Compact layout for dashboard embed */
  compact?: boolean;
  loginNext?: string;
};

export function PlayPackCheckout({
  packs,
  country,
  initialCredits,
  creditsReady,
  initialPending = [],
  compact = false,
  loginNext = "/profile/credits",
}: Props) {
  const router = useRouter();
  const [credits, setCredits] = useState(initialCredits);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(
    packs[0]?.id ?? null,
  );
  const [paymentMethod, setPaymentMethod] =
    useState<JokoPaymentMethodId>("wave");
  const [phone, setPhone] = useState("");
  const [paying, setPaying] = useState(false);
  const [pending, setPending] = useState(initialPending);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedPack = packs.find((p) => p.id === selectedPackId) ?? null;

  useEffect(() => {
    setCredits(initialCredits);
  }, [initialCredits]);

  useEffect(() => {
    if (creditsReady) publishCreditsRemaining(initialCredits);
  }, [creditsReady, initialCredits]);

  useEffect(() => {
    setPending(initialPending);
  }, [initialPending]);

  useEffect(() => subscribeCreditsRemaining(setCredits), []);

  async function payWithJoko() {
    if (!selectedPack || paying) return;
    setPaying(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/play-packs/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pack_id: selectedPack.id,
          payment_method: paymentMethod,
          phone,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        authenticated?: boolean;
        balance?: number | null;
        credits_granted?: number;
        pack_name?: string;
        payment_method?: string;
        mode?: string;
        checkout_url?: string | null;
      };

      if (res.status === 401) {
        window.location.href = `/auth/login?next=${encodeURIComponent(loginNext)}`;
        return;
      }

      if (!res.ok || data.error) {
        setError(data.error || "Payment could not be completed.");
        return;
      }

      if (typeof data.balance === "number") {
        setCredits(data.balance);
        publishCreditsRemaining(data.balance);
      }

      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }

      setMessage(
        `Added ${data.credits_granted ?? 0} play credits${
          data.pack_name ? ` · ${data.pack_name}` : ""
        }. Pay with ${data.payment_method?.replace(/_/g, " ") ?? "JOKO"} — no card needed.`,
      );
      setPending([]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-8"}>
      <div
        className={`flex flex-wrap items-end justify-between gap-3 ${
          compact ? "" : "rounded-xl border border-white/[0.08] bg-white/[0.03] p-5"
        }`}
      >
        <div>
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.24em] text-[#1DB954]">
            Play credits
          </p>
          <p
            className={`mt-1 font-semibold tabular-nums text-[#1DB954] ${
              compact ? "text-2xl" : "text-4xl"
            }`}
          >
            {creditsReady ? credits : "—"}
          </p>
          <p className="mt-1 text-xs text-white/40">
            {creditsReady
              ? "1 credit = 1 stream · mobile money only via JOKO"
              : "Run play credits SQL in Supabase to enable packs."}
          </p>
        </div>
        {!compact ? (
          <Link
            href="/dashboard"
            className="text-xs text-white/45 hover:text-white"
          >
            ← Back to listening
          </Link>
        ) : null}
      </div>

      {message ? (
        <p className="rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-4 py-3 text-sm text-[#1DB954]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-3 text-sm text-[#F5A623]">
          {error}
        </p>
      ) : null}

      {pending.length > 0 ? (
        <div className="rounded-xl border border-[#F5A623]/25 bg-[#F5A623]/[0.06] px-4 py-3 text-sm text-white/70">
          {pending.length} pending payment
          {pending.length === 1 ? "" : "s"} — complete payment below or cancel
          from Home.
        </div>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
          Choose a play pack · {country}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {packs.map((p) => {
            const active = p.id === selectedPackId;
            return (
              <button
                key={p.id}
                type="button"
                disabled={!creditsReady}
                onClick={() => setSelectedPackId(p.id)}
                className={`rounded-xl border px-4 py-4 text-left transition ${
                  active
                    ? "border-[#1DB954]/50 bg-[#1DB954]/10"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20"
                }`}
              >
                <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-white/35">
                  {p.code}
                </p>
                <p className="mt-1 font-semibold">{p.name}</p>
                {p.description ? (
                  <p className="mt-1 text-xs text-white/40">{p.description}</p>
                ) : null}
                <p className="mt-3 text-sm text-[#1DB954]">
                  {p.price_label ?? "—"}
                  {p.play_credits != null ? (
                    <span className="text-white/45">
                      {" "}
                      · {p.play_credits} plays
                    </span>
                  ) : null}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
          Pay through JOKO
        </h2>
        <p className="mt-1 text-xs text-white/35">
          Mobile money only — no bank account or credit card required. Credits
          land on your account as soon as JOKO confirms payment.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {JOKO_PAYMENT_METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={!creditsReady || paying}
              onClick={() => setPaymentMethod(m.id)}
              className={`rounded-xl border px-3 py-3 text-left transition ${
                paymentMethod === m.id
                  ? "border-[#1DB954]/50 bg-[#1DB954]/10"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20"
              }`}
            >
              <p className="text-sm font-semibold">{m.shortLabel}</p>
              <p className="mt-0.5 text-[0.65rem] text-white/40">
                {m.description}
              </p>
            </button>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="text-xs text-white/45">Mobile money number</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+221 70 000 00 00"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-white/25 focus:border-[#1DB954]/50"
          />
        </label>

        <button
          type="button"
          disabled={
            !creditsReady || !selectedPack || paying || phone.trim().length < 8
          }
          onClick={() => void payWithJoko()}
          className="mt-5 w-full rounded-full bg-[#1DB954] py-3.5 text-sm font-semibold text-black hover:bg-[#17a349] disabled:opacity-50 sm:w-auto sm:px-10"
        >
          {paying
            ? "Processing…"
            : selectedPack
              ? `Pay ${selectedPack.price_label ?? ""} with JOKO`
              : "Select a pack"}
        </button>
      </section>
    </div>
  );
}
