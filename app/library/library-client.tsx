"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AddToPlaylist } from "@/components/add-to-playlist";
import { usePlayer } from "@/components/player-provider";
import { RectLogo } from "@/components/rect-logo";
import { QueueTrackButton } from "@/components/queue-track-button";
import { ShareTrackButton } from "@/components/share-track-button";
import { TrackCover } from "@/components/track-cover";
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
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [savingPlaylist, setSavingPlaylist] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTracks(initialTracks);
  }, [initialTracks]);

  const playable = tracks.filter((t) => t.audio_url);

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

  async function clearLikes() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    if (clearing) return;
    setClearing(true);
    setError(null);
    const prev = tracks;
    setTracks([]);
    try {
      const res = await fetch("/api/likes", { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setTracks(prev);
        setError(data.error || "Could not clear likes");
        setConfirmClear(false);
        return;
      }
      setConfirmClear(false);
      router.refresh();
    } catch (e) {
      setTracks(prev);
      setError(e instanceof Error ? e.message : "Network error");
      setConfirmClear(false);
    } finally {
      setClearing(false);
    }
  }

  async function saveAsPlaylist() {
    if (savingPlaylist || tracks.length === 0) return;
    setSavingPlaylist(true);
    setError(null);
    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Liked songs",
          track_ids: tracks.map((t) => t.id),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        playlist?: { id: string };
      };
      if (!res.ok || data.error || !data.playlist?.id) {
        setError(data.error || "Could not save playlist");
        return;
      }
      router.push(`/playlists/${data.playlist.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSavingPlaylist(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#040d06] pb-28 text-[#f8f8f8]">
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
            <Link href="/playlists" className="hover:text-white">
              Playlists
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-8 px-5 py-10 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
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
          {!missingTable && tracks.length > 0 ? (
            <button
              type="button"
              disabled={clearing}
              onClick={() => void clearLikes()}
              onBlur={() => {
                if (!clearing) setConfirmClear(false);
              }}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/45 hover:border-red-400/40 hover:text-red-300 disabled:opacity-50"
            >
              {clearing
                ? "Clearing…"
                : confirmClear
                  ? "Confirm clear all"
                  : "Clear likes"}
            </button>
          ) : null}
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
              <p className="text-sm text-[#F5A623]" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              {playable.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => player.playQueue(playable, 0)}
                    className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-semibold text-black hover:bg-[#17a349]"
                  >
                    ▶ Play all
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      player.playQueue(playable, 0, {
                        shuffle: true,
                        repeat: true,
                      })
                    }
                    className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10"
                  >
                    ⇄ Shuffle
                  </button>
                </>
              ) : null}
              <button
                type="button"
                disabled={savingPlaylist}
                onClick={() => void saveAsPlaylist()}
                className="rounded-full border border-white/20 px-4 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 disabled:opacity-50"
              >
                {savingPlaylist ? "Saving…" : "Save as playlist"}
              </button>
              <p className="text-xs text-white/40">
                {tracks.length} song{tracks.length === 1 ? "" : "s"}
              </p>
            </div>

            <ul className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              {tracks.map((t, i) => {
                const active = player.track?.id === t.id;
                const canPlay = Boolean(t.audio_url);
                const queueIdx = playable.findIndex((x) => x.id === t.id);
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
                    <TrackCover track={t} size="sm" />
                    <button
                      type="button"
                      disabled={!canPlay}
                      onClick={() => {
                        if (!canPlay) return;
                        if (active) player.toggle();
                        else player.playQueue(playable, Math.max(0, queueIdx));
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
                    <AddToPlaylist
                      trackId={t.id}
                      compact
                      loginNext="/library"
                    />
                    <QueueTrackButton track={t} compact />
            <ShareTrackButton track={t} compact />
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
                        else player.playQueue(playable, Math.max(0, queueIdx));
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
