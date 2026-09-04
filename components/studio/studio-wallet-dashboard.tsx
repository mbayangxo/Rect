"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ArtistWalletSummary,
  WalletLedgerRow,
} from "@/lib/dashboard/artist-wallet";

type Props = {
  initial: ArtistWalletSummary;
};

type Scope = "business" | "personal";

export function StudioWalletDashboard({ initial }: Props) {
  const [wallet, setWallet] = useState(initial);
  const [scope, setScope] = useState<Scope>("business");
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState(initial.payoutPhone ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWallet(initial);
    if (initial.payoutPhone) setPhone(initial.payoutPhone);
  }, [initial]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void fetch("/api/studio/wallet")
        .then((r) => r.json())
        .then((data: ArtistWalletSummary) => {
          if (data.ready !== false) setWallet(data);
        })
        .catch(() => {});
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  const scopeBalance =
    scope === "business" ? wallet.businessXof : wallet.personalXof;
  const scopeLedger: WalletLedgerRow[] = useMemo(
    () =>
      scope === "business"
        ? wallet.businessLedger ?? []
        : wallet.personalLedger ?? [],
    [scope, wallet.businessLedger, wallet.personalLedger],
  );

  async function requestPayout() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/studio/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_xof: Number(amount),
          payout_phone: phone,
          scope,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        wallet?: ArtistWalletSummary;
        scheduled_for?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Payout request failed.");
        return;
      }
      if (data.wallet) setWallet(data.wallet);
      setMessage(
        data.scheduled_for
          ? `Payout scheduled for ${new Date(data.scheduled_for).toLocaleDateString()} via JOKO.`
          : "Payout requested via JOKO.",
      );
      setAmount("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  if (!wallet.ready && wallet.error) {
    return (
      <div className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-4 text-sm text-[#F5A623]">
        {wallet.error}
        <p className="mt-2 text-xs text-white/45">
          Run{" "}
          <code className="text-[0.9em]">
            npm run db:apply -- 20260830_monetization_stack.sql
          </code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex gap-2 rounded-full border border-white/10 bg-white/[0.03] p-1">
        <ScopeTab
          active={scope === "business"}
          onClick={() => setScope("business")}
          label="Business wallet"
          sub={`${wallet.businessXof.toLocaleString()} XOF`}
        />
        <ScopeTab
          active={scope === "personal"}
          onClick={() => setScope("personal")}
          label="Personal wallet"
          sub={`${wallet.personalXof.toLocaleString()} XOF`}
        />
      </div>

      <p className="text-xs text-white/40">
        {scope === "business"
          ? "Business wallet — catalog streams, downloads, merch, fan club, and tickets. Label earnings live on Label wallet (owners only)."
          : "Personal wallet — tips and fan support to you as a person. Separate from business catalog revenue."}
      </p>

      {scope === "business" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat
            label="Business balance"
            value={`${wallet.businessXof.toLocaleString()} XOF`}
            accent
          />
          <Stat label="Streams" value={`${wallet.streamsXof.toLocaleString()} XOF`} />
          <Stat
            label="Downloads"
            value={`${wallet.downloadsXof.toLocaleString()} XOF`}
          />
          <Stat label="Merch" value={`${wallet.merchXof.toLocaleString()} XOF`} />
          <Stat
            label="Fan club"
            value={`${wallet.fanClubXof.toLocaleString()} XOF`}
          />
          <Stat
            label="Tickets"
            value={`${wallet.ticketsXof.toLocaleString()} XOF`}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Personal balance"
            value={`${wallet.personalXof.toLocaleString()} XOF`}
            accent
          />
          <Stat label="Tips" value={`${wallet.tipsXof.toLocaleString()} XOF`} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Pending payout"
          value={`${wallet.payoutsPendingXof.toLocaleString()} XOF`}
        />
        <Stat
          label="Next payout window"
          value={
            wallet.nextPayoutAt
              ? new Date(wallet.nextPayoutAt).toLocaleDateString()
              : "Monthly"
          }
        />
      </div>

      <section className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/45">
          Request JOKO payout · {scope === "business" ? "Business" : "Personal"}
        </h2>
        <p className="mt-1 text-xs text-white/35">
          Available now: {scopeBalance.toLocaleString()} XOF · minimum 500 XOF
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-white/45">
            Amount (XOF)
            <input
              type="number"
              min={500}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs text-white/45">
            Mobile money number
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm"
            />
          </label>
        </div>
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
        {message ? (
          <p className="mt-3 text-sm text-[var(--rect)]">{message}</p>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={() => void requestPayout()}
          className="mt-4 rounded-full bg-[var(--rect)] px-6 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
        >
          {pending ? "Requesting…" : "Request payout via JOKO"}
        </button>
      </section>

      {scopeLedger.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/45">
            Recent · {scope === "business" ? "Business" : "Personal"}
          </h2>
          <ul className="mt-3 space-y-2">
            {scopeLedger.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between rounded-lg border border-white/[0.08] px-4 py-2.5 text-sm"
              >
                <span className="text-white/70">
                  {row.description ?? row.kind}
                  <span className="ml-2 text-xs uppercase text-white/30">
                    {row.kind}
                  </span>
                </span>
                <span
                  className={`font-medium tabular-nums ${
                    row.amountXof >= 0
                      ? "text-[var(--rect)]"
                      : "text-[#F5A623]"
                  }`}
                >
                  {row.amountXof >= 0 ? "+" : ""}
                  {row.amountXof.toLocaleString()} XOF
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-white/35">
          {scope === "business"
            ? "No business earnings yet — streams, downloads, merch, and tickets land here."
            : "No personal tips yet — fan support to you appears here."}
        </p>
      )}

      {wallet.payouts.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/45">
            Payout history
          </h2>
          <ul className="mt-3 space-y-2">
            {wallet.payouts.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-white/[0.08] px-4 py-2.5 text-sm"
              >
                <span className="text-white/60">
                  {p.status}
                  {p.scheduledFor
                    ? ` · ${new Date(p.scheduledFor).toLocaleDateString()}`
                    : ""}
                </span>
                <span className="tabular-nums text-white/80">
                  {p.amountXof.toLocaleString()} XOF
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ScopeTab({
  active,
  onClick,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 flex-col items-start rounded-full px-4 py-2.5 text-left transition ${
        active
          ? "bg-[var(--rect)]/20 text-[var(--rect)]"
          : "text-white/45 hover:text-white"
      }`}
    >
      <span className="text-xs font-semibold">{label}</span>
      <span className="text-[0.65rem] tabular-nums opacity-80">{sub}</span>
    </button>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3">
      <p className="text-[0.65rem] uppercase tracking-wider text-white/35">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-semibold tabular-nums ${
          accent ? "text-[var(--rect)]" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
