"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { usePlayer } from "@/components/player-provider";
import { RectLogo } from "@/components/rect-logo";
import type { SearchArtist, SearchTrack } from "@/lib/dashboard/search";
import { trackArtist, trackTitle } from "@/lib/tracks";

const BROWSE = [
  { href: "/charts", label: "Charts", tone: "from-[#0F2B1A] to-[#060908]" },
  { href: "/library", label: "Liked", tone: "from-[#2B0F1A] to-[#090608]" },
  { href: "/journal", label: "Journal", tone: "from-[#0F1A2B] to-[#06080A]" },
  { href: "/profile", label: "You", tone: "from-[#2B1A0F] to-[#090806]" },
] as const;

type Props = {
  initialQuery: string;
  initialTracks: SearchTrack[];
  initialArtists: SearchArtist[];
  initialError: string | null;
};

export function SearchClient({
  initialQuery,
  initialTracks,
  initialArtists,
  initialError,
}: Props) {
  const router = useRouter();
  const player = usePlayer();
  const [q, setQ] = useState(initialQuery);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setQ(initialQuery);
  }, [initialQuery]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = q.trim();
    startTransition(() => {
      router.push(next ? `/search?q=${encodeURIComponent(next)}` : "/search");
    });
  }

  const empty =
    !initialError &&
    initialTracks.length === 0 &&
    initialArtists.length === 0;

  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/dashboard">
            <RectLogo size={34} showWordmark />
          </Link>
          <nav className="flex gap-4 text-sm text-white/55">
            <Link href="/dashboard" className="hover:text-white">
              Home
            </Link>
            <Link href="/search" className="text-[#1DB954]">
              Search
            </Link>
            <Link href="/charts" className="hover:text-white">
              Charts
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl space-y-8 px-5 py-8 sm:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Search
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
            Find music in the world
          </h1>
        </div>

        <form onSubmit={submit} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 focus-within:border-[#1DB954]/50">
          <span className="text-white/35" aria-hidden>
            ⌕
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Artists, songs, genres…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
            aria-label="Search RECT SOUND"
          />
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 rounded-full bg-[#1DB954] px-4 py-1.5 text-xs font-semibold text-black disabled:opacity-60"
          >
            {pending ? "…" : "Search"}
          </button>
        </form>

        {!initialQuery ? (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-white/70">Browse</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {BROWSE.map((b) => (
                <Link
                  key={b.href}
                  href={b.href}
                  className={`flex h-24 items-end rounded-xl border border-white/10 bg-gradient-to-br ${b.tone} p-4 text-sm font-semibold transition hover:border-[#1DB954]/40`}
                >
                  {b.label}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {initialError ? (
          <p className="rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-4 py-3 text-sm text-[#1DB954]">
            Could not search. {initialError}
          </p>
        ) : null}

        {empty ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
            <p className="text-base font-medium">
              {initialQuery
                ? `No results for “${initialQuery}”`
                : "Nothing to browse yet"}
            </p>
            <p className="mt-2 text-sm text-white/40">
              Real tracks and artists from Supabase will show up here.
            </p>
          </div>
        ) : (
          <div className="grid gap-10 lg:grid-cols-2">
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
                Songs {initialTracks.length ? `(${initialTracks.length})` : ""}
              </h2>
              {initialTracks.length === 0 ? (
                <p className="text-sm text-white/40">No songs matched.</p>
              ) : (
                <ul className="space-y-1">
                  {initialTracks.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (t.audio_url) player.play(t);
                        }}
                        disabled={!t.audio_url}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.04] disabled:opacity-40"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1DB954]/15 text-xs font-bold text-[#1DB954]">
                          {trackTitle(t).slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {trackTitle(t)}
                          </span>
                          <span className="block truncate text-xs text-white/40">
                            {trackArtist(t)}
                            {t.genre ? ` · ${t.genre}` : ""}
                          </span>
                        </span>
                        <span className="text-[#1DB954]">▶</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
                Artists {initialArtists.length ? `(${initialArtists.length})` : ""}
              </h2>
              {initialArtists.length === 0 ? (
                <p className="text-sm text-white/40">No artists matched.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {initialArtists.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/artists/${a.id}`}
                        className="block rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-[#1DB954]/40"
                      >
                        <p className="font-semibold">{a.display_name}</p>
                        <p className="mt-1 text-xs text-white/40">
                          {a.genre || "Artist"}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
