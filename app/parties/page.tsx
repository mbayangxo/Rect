import Link from "next/link";
import { ListeningPartiesClient } from "@/app/parties/parties-client";
import { loadLiveParties } from "@/lib/dashboard/listening-parties";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ListeningPartiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const live = await loadLiveParties(supabase, 24);

  return (
    <main className="min-h-dvh bg-[#040d06] pb-28 text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[var(--rect)]">
              Together
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
              Listening parties
            </h1>
            <p className="mt-1 text-sm text-white/45">
              Host or join a room — chat while the same track plays.
            </p>
          </div>
          <Link href="/dashboard" className="text-sm text-white/40 hover:text-white">
            Home
          </Link>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
        <ListeningPartiesClient
          signedIn={Boolean(user)}
          parties={live.parties}
          missingTable={live.missingTable}
          loadError={live.error}
        />
      </div>
    </main>
  );
}
