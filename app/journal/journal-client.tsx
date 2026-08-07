"use client";

import Link from "next/link";
import { usePlayer } from "@/components/player-provider";
import { RectLogo } from "@/components/rect-logo";
import {
  formatPlayedAt,
  type JournalEntry,
} from "@/lib/dashboard/listening-journal";
import { trackArtist, trackTitle } from "@/lib/tracks";

type Props = {
  entries: JournalEntry[];
  loadError: string | null;
  missingTable: boolean;
  activityPrivate: boolean;
};

export function JournalClient({
  entries,
  loadError,
  missingTable,
  activityPrivate,
}: Props) {
  const player = usePlayer();

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
            <Link href="/library" className="hover:text-white">
              Liked
            </Link>
            <Link href="/journal" className="text-[#1DB954]">
              Journal
            </Link>
            <Link href="/profile" className="hover:text-white">
              You
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-8 px-5 py-10 sm:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Listening journal
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
            Your private listening life
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/45">
            Plays you make on RECT SOUND, newest first.
            {activityPrivate
              ? " Only you can see this."
              : " Shared activity isn’t public yet — this journal stays yours."}
          </p>
        </div>

        {missingTable ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
            <p className="text-base font-medium">Journal unavailable</p>
            <p className="mt-2 text-sm text-white/40">
              Play history table isn’t reachable yet.
            </p>
          </div>
        ) : loadError ? (
          <p className="rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-4 py-3 text-sm text-[#1DB954]">
            Could not load journal. {loadError}
          </p>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
            <p className="text-base font-medium">No plays yet</p>
            <p className="mt-2 text-sm text-white/40">
              Press play on Home — each listen lands here.
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-block rounded-full bg-[#1DB954] px-5 py-2 text-sm font-semibold text-black"
            >
              Go to Home
            </Link>
          </div>
        ) : (
          <>
            <p className="text-xs text-white/40">
              {entries.length} recent play{entries.length === 1 ? "" : "s"}
            </p>
            <ul className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              {entries.map((e) => {
                const active = player.track?.id === e.id;
                const canPlay = Boolean(e.audio_url);
                return (
                  <li
                    key={e.play_id}
                    className={`flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 last:border-0 ${
                      active ? "bg-[#1DB954]/10" : ""
                    }`}
                  >
                    <span className="w-14 shrink-0 text-[0.65rem] tabular-nums text-white/35">
                      {formatPlayedAt(e.played_at)}
                    </span>
                    <button
                      type="button"
                      disabled={!canPlay}
                      onClick={() => {
                        if (!canPlay) return;
                        if (active) player.toggle();
                        else player.play(e);
                      }}
                      className="min-w-0 flex-1 text-left disabled:opacity-40"
                    >
                      <span className="block truncate text-sm font-medium">
                        {trackTitle(e)}
                      </span>
                      <span className="block truncate text-xs text-white/40">
                        {trackArtist(e)}
                        {e.genre ? ` · ${e.genre}` : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={!canPlay}
                      onClick={() => {
                        if (!canPlay) return;
                        if (active) player.toggle();
                        else player.play(e);
                      }}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1DB954] text-sm font-bold text-black disabled:opacity-40"
                      aria-label={
                        active && player.playing ? "Pause" : "Play"
                      }
                    >
                      {active && player.playing ? "❚❚" : "▶"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
