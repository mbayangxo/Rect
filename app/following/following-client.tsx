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
import type {
  FollowedArtist,
  FollowingFeedTrack,
} from "@/lib/dashboard/follows";
import { trackArtist, trackTitle } from "@/lib/tracks";

type Props = {
  artists: FollowedArtist[];
  tracks: FollowingFeedTrack[];
  loadError: string | null;
  missingTable: boolean;
};

export function FollowingClient({
  artists: initialArtists,
  tracks: initialTracks,
  loadError,
  missingTable,
}: Props) {
  const router = useRouter();
  const player = usePlayer();
  const [artists, setArtists] = useState(initialArtists);
  const [tracks, setTracks] = useState(initialTracks);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setArtists(initialArtists);
    setTracks(initialTracks);
  }, [initialArtists, initialTracks]);

  async function unfollow(artistId: string) {
    setPendingId(artistId);
    setError(null);
    const prevArtists = artists;
    const prevTracks = tracks;
    setArtists((list) => list.filter((a) => a.id !== artistId));
    setTracks((list) => list.filter((t) => t.artist_id !== artistId));
    try {
      const res = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist_id: artistId }),
      });
      const data = (await res.json()) as {
        error?: string;
        following?: boolean;
      };
      if (!res.ok || data.error) {
        setArtists(prevArtists);
        setTracks(prevTracks);
        setError(data.error || "Could not unfollow");
        return;
      }
      if (data.following) {
        setArtists(prevArtists);
        setTracks(prevTracks);
        setError("Could not unfollow — try again");
        return;
      }
      router.refresh();
    } catch (e) {
      setArtists(prevArtists);
      setTracks(prevTracks);
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPendingId(null);
    }
  }

  async function clearFollows() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    if (clearing) return;
    setClearing(true);
    setError(null);
    const prevArtists = artists;
    const prevTracks = tracks;
    setArtists([]);
    setTracks([]);
    try {
      const res = await fetch("/api/follows", { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setArtists(prevArtists);
        setTracks(prevTracks);
        setError(data.error || "Could not unfollow all");
        setConfirmClear(false);
        return;
      }
      setConfirmClear(false);
      router.refresh();
    } catch (e) {
      setArtists(prevArtists);
      setTracks(prevTracks);
      setError(e instanceof Error ? e.message : "Network error");
      setConfirmClear(false);
    } finally {
      setClearing(false);
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
            <Link href="/following" className="text-[#1DB954]">
              Following
            </Link>
            <Link href="/library" className="hover:text-white">
              Library
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-10 px-5 py-10 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
              Following
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
              Artists you follow
            </h1>
            <p className="mt-2 text-sm text-white/45">
              New published tracks from your artists, saved in your account.
            </p>
          </div>
          {!missingTable && artists.length > 0 ? (
            <button
              type="button"
              disabled={clearing}
              onClick={() => void clearFollows()}
              onBlur={() => {
                if (!clearing) setConfirmClear(false);
              }}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/45 hover:border-red-400/40 hover:text-red-300 disabled:opacity-50"
            >
              {clearing
                ? "Clearing…"
                : confirmClear
                  ? "Confirm unfollow all"
                  : "Unfollow all"}
            </button>
          ) : null}
        </div>

        {missingTable ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center">
            <p className="text-base font-medium">Follows not set up yet</p>
            <p className="mt-2 text-sm text-white/40">
              Run{" "}
              <code className="text-[#1DB954]">
                20260807_artist_follows.sql
              </code>{" "}
              in Supabase, then refresh.
            </p>
          </div>
        ) : null}

        {loadError ? (
          <p
            className="rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-4 py-3 text-sm text-[#1DB954]"
            role="alert"
          >
            {loadError}
          </p>
        ) : null}

        {error ? (
          <p className="text-sm text-[#1DB954]" role="alert">
            {error}
          </p>
        ) : null}

        {!missingTable && artists.length === 0 && !loadError ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
            <p className="text-base font-medium">No artists yet</p>
            <p className="mt-2 text-sm text-white/40">
              Open an artist portal and tap Follow.
            </p>
            <Link
              href="/search"
              className="mt-6 inline-block text-sm text-[#1DB954] hover:underline"
            >
              Find artists
            </Link>
          </div>
        ) : null}

        {artists.length > 0 ? (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
              Artists
            </h2>
            <ul className="space-y-2">
              {artists.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <Link href={`/artists/${a.id}`} className="min-w-0 flex-1">
                    <p className="truncate font-medium hover:text-[#1DB954]">
                      {a.display_name}
                    </p>
                    <p className="truncate text-xs text-white/40">
                      {[a.city, a.genres.slice(0, 2).join(" · ")]
                        .filter(Boolean)
                        .join(" · ") || "RECT SOUND artist"}
                    </p>
                  </Link>
                  <button
                    type="button"
                    onClick={() => unfollow(a.id)}
                    disabled={pendingId === a.id}
                    className="shrink-0 rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 disabled:opacity-50"
                  >
                    {pendingId === a.id ? "…" : "Unfollow"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {tracks.length > 0 ? (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
              Fresh from following
            </h2>
            <ul className="space-y-1 rounded-2xl border border-white/10 bg-white/[0.03] p-2 md:p-3">
              {tracks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-white/[0.06]"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (t.audio_url) player.play(t);
                    }}
                    disabled={!t.audio_url}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-40"
                  >
                    <TrackCover track={t} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {trackTitle(t)}
                      </p>
                      <p className="truncate text-xs text-white/40">
                        {trackArtist(t)}
                      </p>
                    </div>
                  </button>
                  <AddToPlaylist
                    trackId={t.id}
                    compact
                    loginNext="/following"
                  />
                  <QueueTrackButton track={t} compact />
            <ShareTrackButton track={t} compact />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
