"use client";

import Link from "next/link";
import { AddToPlaylist } from "@/components/add-to-playlist";
import { usePlayer } from "@/components/player-provider";
import { RectLogo } from "@/components/rect-logo";
import { QueueTrackButton } from "@/components/queue-track-button";
import { ShareTrackButton } from "@/components/share-track-button";
import { TrackCover } from "@/components/track-cover";
import {
  formatReleasedAt,
  type NewReleaseTrack,
} from "@/lib/dashboard/new-releases";
import { trackArtist, trackTitle } from "@/lib/tracks";

type Props = {
  tracks: NewReleaseTrack[];
  loadError: string | null;
  personalized: boolean;
};

export function NewReleasesClient({
  tracks,
  loadError,
  personalized,
}: Props) {
  const player = usePlayer();
  const playable = tracks.filter((t) => t.audio_url);

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
            <Link href="/new" className="text-[#1DB954]">
              New
            </Link>
            <Link href="/genres" className="hover:text-white">
              Genres
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
            First light
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
            New releases
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/45">
            {personalized
              ? "Newest published drops, with your taste genres nudged up."
              : "Newest published tracks on RECT SOUND."}
          </p>
          {playable.length > 0 ? (
            <button
              type="button"
              onClick={() => player.playQueue(playable, 0)}
              className="mt-5 rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-semibold text-black hover:bg-[#17a349]"
            >
              ▶ Play all
            </button>
          ) : null}
        </div>

        {loadError ? (
          <p className="text-sm text-[#1DB954]" role="alert">
            {loadError}
          </p>
        ) : null}

        {tracks.length === 0 && !loadError ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
            <p className="text-base font-medium">Nothing new yet</p>
            <p className="mt-2 text-sm text-white/40">
              Published uploads will show here first.
            </p>
          </div>
        ) : (
          <ul className="space-y-1 rounded-2xl border border-white/10 bg-white/[0.03] p-2 md:p-3">
            {tracks.map((t, i) => (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-white/[0.06]"
              >
                <button
                  type="button"
                  disabled={!t.audio_url}
                  onClick={() => {
                    if (!t.audio_url) return;
                    const idx = playable.findIndex((x) => x.id === t.id);
                    player.playQueue(playable, idx >= 0 ? idx : 0);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-40"
                >
                  <span className="w-5 shrink-0 text-xs text-white/35">
                    {i + 1}
                  </span>
                  <TrackCover track={t} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {trackTitle(t)}
                    </p>
                    <p className="truncate text-xs text-white/40">
                      {trackArtist(t)}
                      {t.genre ? ` · ${t.genre}` : ""}
                      {" · "}
                      {formatReleasedAt(t.created_at)}
                      {t.like_count > 0
                        ? ` · ${t.like_count} likes`
                        : ""}
                    </p>
                  </div>
                </button>
                <Link
                  href={`/songs/${t.id}`}
                  className="shrink-0 text-xs text-white/35 hover:text-[#1DB954]"
                >
                  Open
                </Link>
                <AddToPlaylist trackId={t.id} compact loginNext="/new" />
                <QueueTrackButton track={t} compact />
            <ShareTrackButton track={t} compact />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
