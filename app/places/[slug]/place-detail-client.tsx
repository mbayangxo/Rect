"use client";

import Link from "next/link";
import { AddToPlaylist } from "@/components/add-to-playlist";
import { usePlayer } from "@/components/player-provider";
import { RectLogo } from "@/components/rect-logo";
import { QueueTrackButton } from "@/components/queue-track-button";
import { ShareTrackButton } from "@/components/share-track-button";
import { TrackCover } from "@/components/track-cover";
import { TrackLikeButton } from "@/components/track-like-button";
import type { PlaceArtist, PlaceTrack } from "@/lib/dashboard/places";
import { trackArtist, trackTitle, formatTrackDuration } from "@/lib/tracks";

type Props = {
  slug: string;
  placeName: string;
  artists: PlaceArtist[];
  tracks: PlaceTrack[];
  loadError: string | null;
  likedTracks?: Record<string, boolean>;
  likesReady?: boolean;
};

export function PlaceDetailClient({
  slug,
  placeName,
  artists,
  tracks,
  loadError,
  likedTracks = {},
  likesReady = false,
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
            <Link href="/places" className="hover:text-white">
              Places
            </Link>
            <Link href="/genres" className="hover:text-white">
              Genres
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-10 px-5 py-10 sm:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Place
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
            {placeName}
          </h1>
          <p className="mt-2 text-sm text-white/45">
            {artists.length}{" "}
            {artists.length === 1 ? "artist" : "artists"}
            {" · "}
            {tracks.length} published{" "}
            {tracks.length === 1 ? "track" : "tracks"}
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

        {artists.length > 0 ? (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
              Artists
            </h2>
            <ul className="flex flex-wrap gap-2">
              {artists.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/artists/${a.id}`}
                    className="inline-block rounded-full border border-white/15 px-3 py-1.5 text-sm text-white/80 hover:border-[#1DB954]/50 hover:text-[#1DB954]"
                  >
                    {a.display_name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {tracks.length > 0 ? (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
              Tracks
            </h2>
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
                        {t.like_count > 0
                          ? ` · ${t.like_count} likes`
                          : ""}
                        {formatTrackDuration(t.duration_secs)
                          ? ` · ${formatTrackDuration(t.duration_secs)}`
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
                  <AddToPlaylist
                    trackId={t.id}
                    compact
                    loginNext={`/places/${slug}`}
                  />
                  <TrackLikeButton
                    trackId={t.id}
                    initialLiked={Boolean(likedTracks[t.id])}
                    likesReady={likesReady}
                    loginNext={`/places/${slug}`}
                    compact
                  />
                  <QueueTrackButton track={t} compact />
                  <ShareTrackButton track={t} compact />
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center">
            <p className="text-sm text-white/45">
              No published tracks from this place yet.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
