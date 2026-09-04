import Link from "next/link";
import { HearingAidsClient } from "@/app/hearing-aids/hearing-aids-client";
import { loadHearingAidEpisodes } from "@/lib/dashboard/hearing-aids";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Hearing Aids — on-demand podcasts / talk under Wave (not the social Inbox). */
export default async function HearingAidsPage() {
  const supabase = await createClient();
  const result = await loadHearingAidEpisodes(supabase, 40);

  return (
    <main className="min-h-dvh bg-[#040d06] pb-28 text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[var(--rect)]">
              Wave · Hearing Aids
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
              Hearing Aids
            </h1>
            <p className="mt-1 text-sm text-white/45">
              On-demand podcasts and talk — not live Wave stations, not your
              social Inbox.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-sm">
            <Link href="/radio" className="text-[var(--rect)] hover:underline">
              Open Wave →
            </Link>
            <Link href="/inbox" className="text-white/40 hover:text-white">
              Inbox →
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
        {result.missingColumn ? (
          <p className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-3 text-sm text-[#F5A623]">
            Run{" "}
            <code className="text-xs">20260904_hearing_aids_and_punch.sql</code>{" "}
            in RECT Supabase to enable Hearing Aids.
          </p>
        ) : (
          <HearingAidsClient
            episodes={result.episodes}
            loadError={result.error}
          />
        )}
      </div>
    </main>
  );
}
