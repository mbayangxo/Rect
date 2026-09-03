"use client";

import { useEffect, useState } from "react";
import type { ArtistWalletSummary } from "@/lib/dashboard/artist-wallet";

type Props = {
  initial: ArtistWalletSummary;
};

export function StudioWalletDashboard({ initial }: Props) {
  const [wallet, setWallet] = useState(initial);
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
          <code className="text-[0.9em]">npm run db:apply -- 20260830_monetization_stack.sql</code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Balance" value={`${wallet.balanceXof.toLocaleString()} XOF`} accent />
        <Stat label="Streams" value={`${wallet.streamsXof.toLocaleString()} XOF`} />
        <Stat label="Downloads" value={`${wallet.downloadsXof.toLocaleString()} XOF`} />
        <Stat label="Merch" value={`${wallet.merchXof.toLocaleString()} XOF`} />
        <Stat label="Fan club" value={`${wallet.fanClubXof.toLocaleString()} XOF`} />
        <Stat label="Tickets" value={`${wallet.ticketsXof.toLocaleString()} XOF`} />
        <Stat label="Tips" value={`${wallet.tipsXof.toLocaleString()} XOF`} />
        <Stat label="Pending payout" value={`${wallet.payoutsPendingXof.toLocaleString()} XOF`} />
        <Stat
          label="Next payout window"
          value={
            wallet.nextPayoutAt
              ? new Date(wallet.nextPayoutAt).toLocaleDateString()
              : "Monthly"
          }
        />
      </div>

      <p className="text-xs text-white/35">
        Live balance refreshes every 5 seconds. Fan money flows through JOKO
        (streams, downloads, merch, fan club, tips via Wave / Orange / MTN / JOKO
        wallet / debit) and FEKK (tour tickets).
      </p>

      <section className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/45">
          Request JOKO payout
        </h2>
        <p className="mt-1 text-xs text-white/35">
          Minimum 500 XOF · requested / pending settlement until JOKO pays out
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
        {message ? <p className="mt-3 text-sm text-[#1DB954]">{message}</p> : null}
        <button
          type="button"
          disabled={pending}
          onClick={() => void requestPayout()}
          className="mt-4 rounded-full bg-[#1DB954] px-6 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
        >
          {pending ? "Requesting…" : "Request payout via JOKO"}
        </button>
      </section>

      {wallet.ledger.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/45">
            Recent earnings
          </h2>
          <ul className="mt-3 space-y-2">
            {wallet.ledger.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between rounded-lg border border-white/[0.08] px-4 py-2.5 text-sm"
              >
                <span className="text-white/70">
                  {row.description ?? row.kind}
                  <span className="ml-2 text-xs uppercase text-white/30">{row.kind}</span>
                </span>
                <span
                  className={`tabular-nums font-medium ${
                    row.amountXof >= 0 ? "text-[#1DB954]" : "text-[#F5A623]"
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
          No wallet ledger entries yet — earnings appear after fan plays, downloads, merch, or fan club payments.
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
                <span>
                  {p.amountXof.toLocaleString()} XOF
                  <span className="ml-2 text-xs text-white/35">{p.status}</span>
                </span>
                <span className="text-xs text-white/40">
                  {new Date(p.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
      <p className="text-[0.65rem] uppercase tracking-wider text-white/40">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${
          accent ? "text-[#1DB954]" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
