"use client";

import Link from "next/link";
import { RectLogo } from "@/components/rect-logo";
import type { GenreHub } from "@/lib/dashboard/genres";

const TONES = [
  "from-[#0F2B1A] to-[#060908]",
  "from-[#1A2B0F] to-[#080906]",
  "from-[#0F1A2B] to-[#06080A]",
  "from-[#2B1A0F] to-[#090806]",
  "from-[#1a0f2b] to-[#080609]",
  "from-[#2B0F1A] to-[#090608]",
] as const;

type Props = {
  hubs: GenreHub[];
  loadError: string | null;
  personalized: boolean;
};

export function GenresClient({ hubs, loadError, personalized }: Props) {
  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/dashboard">
            <RectLogo size={34} showWordmark />
          </Link>
          <nav className="flex gap-4 text-sm text-white/55">
            <Link href="/search" className="hover:text-white">
              Search
            </Link>
            <Link href="/genres" className="text-[#1DB954]">
              Genres
            </Link>
            <Link href="/radio" className="hover:text-white">
              Wave
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-8 px-5 py-10 sm:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Genres
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
            Browse by sound
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/45">
            {personalized
              ? "Your taste genres rise to the top — filled from published tracks."
              : "Hubs built from published catalog genres."}
          </p>
        </div>

        {loadError ? (
          <p className="text-sm text-[#1DB954]" role="alert">
            {loadError}
          </p>
        ) : null}

        {hubs.length === 0 && !loadError ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
            <p className="text-base font-medium">No genres yet</p>
            <p className="mt-2 text-sm text-white/40">
              Published tracks with a genre will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hubs.map((h, i) => (
              <Link
                key={h.slug}
                href={`/genres/${h.slug}`}
                className={`rounded-2xl bg-gradient-to-br ${TONES[i % TONES.length]} border border-white/10 px-5 py-6 transition hover:border-[#1DB954]/40`}
              >
                <p className="text-lg font-semibold tracking-tight">{h.name}</p>
                <p className="mt-2 text-xs text-white/45">
                  {h.track_count}{" "}
                  {h.track_count === 1 ? "track" : "tracks"}
                  {h.for_you ? " · For you" : ""}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
