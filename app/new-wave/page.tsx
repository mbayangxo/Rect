import Link from "next/link";
import { NewWaveClient } from "@/app/new-wave/new-wave-client";
import { loadNewWaveTracks } from "@/lib/dashboard/new-wave";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewWavePage() {
  const supabase = await createClient();
  const result = await loadNewWaveTracks(supabase, 40);

  return (
    <main className="min-h-dvh bg-[#040d06] pb-28 text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[#1DB954]">
              Mix · New Wave
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
              New Wave
            </h1>
            <p className="mt-1 text-sm text-white/45">
              Fresh launches on RECT — scheduled drops appear here when their
              launch date hits.
            </p>
          </div>
          <Link
            href="/new"
            className="text-sm text-[#1DB954] hover:underline"
          >
            All new →
          </Link>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
        <NewWaveClient
          tracks={result.tracks}
          loadError={result.error}
        />
      </div>
    </main>
  );
}
