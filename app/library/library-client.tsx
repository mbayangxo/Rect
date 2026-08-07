"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePlayer } from "@/components/player-provider";
import { RectLogo } from "@/components/rect-logo";
import type { LikedTrack } from "@/lib/dashboard/likes";
import { trackArtist, trackTitle } from "@/lib/tracks";

type Props = {
  initialTracks: LikedTrack[];
  loadError: string | null;
  missingTable: boolean;
};

export function LibraryClient({
  initialTracks,
  loadError,
  missingTable,
}: Props) {
  const router = useRouter();
  const player = usePlayer();
  const [tracks, setTracks] = useState(initialTracks);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTracks(initialTracks);
  }, [initialTracks]);

  async function unlike(trackId: string) {
    setPendingId(trackId);
    setError(null);
    const prev = tracks;
    setTracks((list) => list.filter((t) => t.id !== trackId));
    try {
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_id: trackId }),
      });
      const data = (await res.json()) as { error?: string; liked?: boolean };
      if (!res.ok || data.error) {
        setTracks(prev);
        setError(data.error || "Could not update like");
        return;
      }
      // Toggle should leave liked=false; if somehow still liked, restore
      if (data.liked) {
        setTracks(prev);
        setError("Could not unlike — try again");
        return;
      }
      router.refresh();
    } catch (e) {
      setTracks(prev);
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPendingId(null);
    }
  }

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
            <Link href="/search" className="hover:text-white">
              Search
            </Link>
            <Link href="/library" className="text-[#1DB954]">
              Library
            </Link>
            <Link href="/charts" className="hover:text-white">
              Charts
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-8 px-5 py-10 sm:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Your library
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
            Liked songs
          </h1>
          <p className="mt-2 text-sm text-white/45">
            Tracks you heart on RECT SOUND — saved in your account.
          </p>
        </div>

        {missingTable ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
            <p className="text-base font-medium">Likes not enabled yet</p>
            <p className="mt-2 text-sm text-white/40">
              Run the track likes SQL in Supabase, then heart songs from Home.
            </p>
          </div>
        ) : loadError ? (
          <p className="rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-4 py-3 text-sm text-[#1DB954]">
            Could not load library. {loadError}
          </p>
        ) : tracks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
            <p className="text-base font-medium">No liked songs yet</p>
            <p className="mt-2 text-sm text-white/40">
              Tap ♥ on a track in Home to save it here.
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
            {error ? (
              <p className="text-sm text-[#F5A623]">{error}</p>
            ) : null}
            <p className="text-xs text-white/40">
              {tracks.length} song{tracks.length === 1 ? "" : "s"}
            </p>
            <ul className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              {tracks.map((t, i) => {
                const active = player.track?.id === t.id;
                const canPlay = Boolean(t.audio_url);
                return (
                  <li
                    key={t.id}
                    className={`flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 last:border-0 ${
                      active ? "bg-[#1DB954]/10" : ""
                    }`}
                  >
                    <span className="w-6 shrink-0 text-center text-xs tabular-nums text-white/35">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      disabled={!canPlay}
                      onClick={() => {
                        if (!canPlay) return;
                        if (active) player.toggle();
                        else player.play(t);
                      }}
                      className="min-w-0 flex-1 text-left disabled:opacity-40"
                    >
                      <span className="block truncate text-sm font-medium">
                        {trackTitle(t)}
                      </span>
                      <span className="block truncate text-xs text-white/40">
                        {trackArtist(t)}
                        {t.genre ? ` · ${t.genre}` : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={pendingId === t.id}
                      onClick={() => void unlike(t.id)}
                      className="shrink-0 px-2 text-lg text-[#1DB954] disabled:opacity-40"
                      aria-label={`Unlike ${trackTitle(t)}`}
                      title="Unlike"
                    >
                      ♥
                    </button>
                    <button
                      type="button"
                      disabled={!canPlay}
                      onClick={() => {
                        if (!canPlay) return;
                        if (active) player.toggle();
                        else player.play(t);
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
