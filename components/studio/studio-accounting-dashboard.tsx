"use client";

import Link from "next/link";
import type { ArtistAccountingStatement } from "@/lib/dashboard/artist-accounting";

type Props = {
  initial: ArtistAccountingStatement;
};

export function StudioAccountingDashboard({ initial }: Props) {
  function downloadCsv() {
    const lines = [
      "kind,label,credit_xof,debit_xof,net_xof,entries,month",
      ...initial.kindRows.map(
        (r) =>
          `${csv(r.kind)},${csv(r.label)},${r.creditXof},${r.debitXof},${r.netXof},${r.entries},${csv(initial.monthLabel)}`,
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rect-statement-${initial.monthStartIso.slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!initial.walletReady) {
    return (
      <div className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-4 text-sm text-[#F5A623]">
        {initial.error || "Wallet ledger not ready."}
        <p className="mt-2 text-xs text-white/45">
          Run{" "}
          <code className="text-white/70">20260830_monetization_stack.sql</code>{" "}
          then open Studio → Wallet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/55">
        {initial.note}
      </p>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-white/40">
            Net this month
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-[#1DB954]">
            {initial.totalNetXof.toLocaleString()} XOF
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadCsv}
            disabled={!initial.ledgerCsvReady || initial.kindRows.length === 0}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 disabled:opacity-40"
          >
            Export CSV
          </button>
          <Link
            href="/studio/wallet"
            className="rounded-full bg-[#1DB954] px-4 py-2 text-xs font-semibold text-black"
          >
            Wallet & payouts
          </Link>
        </div>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
          By kind · {initial.monthLabel}
        </h2>
        {initial.kindRows.length === 0 ? (
          <p className="mt-3 text-sm text-white/40">
            No ledger activity this month yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {initial.kindRows.map((r) => (
              <li
                key={r.kind}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">{r.label}</p>
                  <p className="text-xs text-white/35">
                    {r.entries} entr{r.entries === 1 ? "y" : "ies"}
                    {r.creditXof > 0
                      ? ` · +${r.creditXof.toLocaleString()} credit`
                      : ""}
                    {r.debitXof > 0
                      ? ` · −${r.debitXof.toLocaleString()} debit`
                      : ""}
                  </p>
                </div>
                <p
                  className={`tabular-nums font-semibold ${
                    r.netXof >= 0 ? "text-[#1DB954]" : "text-[#F5A623]"
                  }`}
                >
                  {r.netXof >= 0 ? "+" : ""}
                  {r.netXof.toLocaleString()} XOF
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
          Writer split report (RECT streams)
        </h2>
        <p className="mt-1 text-xs text-white/35">
          Approximate share of this month&apos;s stream credits by writer %.
          Not a substitute for a publishing admin — for transparency with your
          co-writers.
        </p>
        {initial.writerRows.length === 0 ? (
          <p className="mt-3 text-sm text-white/40">
            Add writer splits on tracks (Studio → Tracks) to see owed amounts.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {initial.writerRows.map((w, i) => (
              <li
                key={`${w.trackId}-${w.writerName}-${i}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.08] px-4 py-2.5 text-sm"
              >
                <span>
                  <span className="font-medium">{w.writerName}</span>
                  <span className="text-white/40">
                    {" "}
                    · {w.sharePercent}% · {w.trackTitle}
                  </span>
                </span>
                <span className="tabular-nums text-[#1DB954]">
                  {w.owedXof.toLocaleString()} XOF
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function csv(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
