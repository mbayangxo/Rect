"use client";

import Link from "next/link";
import type { LabelWalletSummary } from "@/lib/dashboard/label-wallet";

type Props = {
  initial: LabelWalletSummary;
};

export function StudioLabelWalletDashboard({ initial }: Props) {
  const wallet = initial;

  if (wallet.missingTable || (!wallet.ready && wallet.error)) {
    return (
      <div className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-4 text-sm text-[#F5A623]">
        {wallet.error || "Label wallet tables missing."}
        <p className="mt-2 text-xs text-white/45">
          Paste{" "}
          <code className="text-[0.9em]">
            20260904_wallets_personal_business_label.sql
          </code>{" "}
          in Supabase.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-4">
          <p className="text-[0.65rem] uppercase tracking-wider text-white/35">
            Label balance
          </p>
          <p className="mt-1 font-[family-name:var(--font-syne)] text-2xl font-semibold tabular-nums text-[var(--rect)]">
            {wallet.balanceXof.toLocaleString()} XOF
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-4">
          <p className="text-[0.65rem] uppercase tracking-wider text-white/35">
            From roster splits
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
            {wallet.splitsXof.toLocaleString()} XOF
          </p>
        </div>
      </div>

      <p className="text-xs text-white/40">
        When a roster artist earns (streams, tips, merch…), your accepted split %
        credits this label wallet — never the artist Business/Personal wallets of
        fans or non-owners.{" "}
        <Link href="/studio/label" className="text-[var(--rect)] hover:underline">
          Manage roster →
        </Link>
      </p>

      {wallet.ledger.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/45">
            Recent label ledger
          </h2>
          <ul className="mt-3 space-y-2">
            {wallet.ledger.map((row) => (
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
          No label earnings yet — accepted roster splits appear here after plays
          and sales.
        </p>
      )}
    </div>
  );
}
