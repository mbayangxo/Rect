import Link from "next/link";
import { RectLogo } from "@/components/rect-logo";

export default function SearchPage() {
  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/">
            <RectLogo size={34} showWordmark />
          </Link>
          <Link href="/dashboard" className="text-sm text-[#1DB954]">
            Dashboard
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-lg px-5 py-16 text-center sm:px-8">
        <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
          Search
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Find your next listen
        </h1>
        <p className="mt-3 text-sm text-white/45">
          Search is coming to RECT SOUND soon.
        </p>
        <div className="mt-8 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-left text-sm text-white/30">
          Artists, songs, genres…
        </div>
      </div>
    </main>
  );
}
