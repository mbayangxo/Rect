import Link from "next/link";
import { NewWaveShowsClient } from "@/app/new-wave/new-wave-client";
import { loadNewWaveShows } from "@/lib/dashboard/new-wave-shows";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** New Wave = new radio shows on Wave (not music launches — those are New Sounds). */
export default async function NewWavePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const result = await loadNewWaveShows(supabase, user?.id ?? null, 24);

  return (
    <main className="min-h-dvh bg-[#040d06] pb-28 text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[var(--rect)]">
              Wave · New Wave
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
              New Wave
            </h1>
            <p className="mt-1 text-sm text-white/45">
              Fresh radio shows on Wave — stations and live rooms worth tuning
              into now.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-sm">
            <Link href="/radio" className="text-[var(--rect)] hover:underline">
              Open Wave →
            </Link>
            <Link href="/new-sounds" className="text-white/40 hover:text-white">
              New Sounds (music) →
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
        <NewWaveShowsClient shows={result.shows} loadError={result.error} />
      </div>
    </main>
  );
}
