"use client";

import Link from "next/link";
import { RectLogo } from "@/components/rect-logo";
import type { MyTip } from "@/lib/dashboard/tips";

type Props = {
  tips: MyTip[];
  totalXof: number;
  loadError: string | null;
  missingTable: boolean;
};

export function TipsClient({
  tips,
  totalXof,
  loadError,
  missingTable,
}: Props) {
  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/dashboard">
            <RectLogo size={34} showWordmark />
          </Link>
          <nav className="flex gap-4 text-sm text-white/55">
            <Link href="/dashboard" className="hover:text-white">
              Home
            </Link>
            <Link href="/following" className="hover:text-white">
              Following
            </Link>
            <Link href="/tips" className="text-[#1DB954]">
              Tips
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-8 px-5 py-10 sm:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Your tips
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
            Support sent
          </h1>
          <p className="mt-2 text-sm text-white/45">
            Confirmed tips from your account
            {!missingTable
              ? ` · ${totalXof.toLocaleString()} XOF total`
              : ""}
            .
          </p>
        </div>

        {missingTable ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center">
            <p className="text-base font-medium">Tips not set up yet</p>
            <p className="mt-2 text-sm text-white/40">
              Run{" "}
              <code className="text-[#1DB954]">20260807_artist_tips.sql</code>{" "}
              in Supabase, then refresh.
            </p>
          </div>
        ) : null}

        {loadError ? (
          <p className="text-sm text-[#1DB954]" role="alert">
            {loadError}
          </p>
        ) : null}

        {!missingTable && tips.length === 0 && !loadError ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
            <p className="text-base font-medium">No tips yet</p>
            <p className="mt-2 text-sm text-white/40">
              Open an artist portal and send 100, 200, or 500 XOF.
            </p>
            <Link
              href="/search"
              className="mt-6 inline-block text-sm text-[#1DB954] hover:underline"
            >
              Find artists
            </Link>
          </div>
        ) : null}

        {tips.length > 0 ? (
          <ul className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
            {tips.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-4 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/artists/${t.artist_id}`}
                    className="block truncate font-medium hover:text-[#1DB954]"
                  >
                    {t.artist_name}
                  </Link>
                  <p className="mt-1 text-xs text-white/40">
                    {t.created_at
                      ? new Date(t.created_at).toLocaleString()
                      : "—"}
                    {" · "}
                    {t.payment_method}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-[#1DB954]">
                  {t.amount_xof.toLocaleString()} XOF
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
