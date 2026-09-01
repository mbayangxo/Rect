"use client";

import Link from "next/link";
import { AddToPlaylist } from "@/components/add-to-playlist";
import { usePlayer } from "@/components/player-provider";
import { QueueTrackButton } from "@/components/queue-track-button";
import { ShareTrackButton } from "@/components/share-track-button";
import { TrackCover } from "@/components/track-cover";
import { TrackLikeButton } from "@/components/track-like-button";
import { formatTrackDuration, trackArtist, trackTitle, type TrackRow } from "@/lib/tracks";

export function TrackList({
  tracks,
  likedTracks = {},
  likesReady = false,
  loginNext = "/dashboard",
  showPlayAll = true,
}: {
  tracks: TrackRow[];
  likedTracks?: Record<string, boolean>;
  likesReady?: boolean;
  loginNext?: string;
  /** Show ▶ Play all above the list when any track has audio. */
  showPlayAll?: boolean;
}) {
  const { track: current, playing, playQueue, toggle } = usePlayer();
  const playable = tracks.filter((t) => Boolean(t.audio_url));

  function playFromList(t: TrackRow) {
    if (!t.audio_url) return;
    if (current?.id === t.id) {
      toggle();
      return;
    }
    const idx = playable.findIndex((x) => x.id === t.id);
    playQueue(playable, idx >= 0 ? idx : 0);
  }

  return (
    <div className="space-y-3">
      {showPlayAll && playable.length > 0 ? (
        <button
          type="button"
          onClick={() => playQueue(playable, 0)}
          className="rounded-full bg-[#1DB954] px-4 py-2 text-xs font-semibold text-black hover:bg-[#17a349]"
        >
          ▶ Play all
        </button>
      ) : null}
      <ul className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
        {tracks.map((t, i) => {
          const active = current?.id === t.id;
          const canPlay = Boolean(t.audio_url);
          return (
            <li
              key={t.id}
              className={`flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 last:border-b-0 ${
                active ? "bg-[#1DB954]/10" : "hover:bg-white/[0.04]"
              }`}
            >
              <span className="w-6 shrink-0 text-center text-xs tabular-nums text-white/35">
                {i + 1}
              </span>
              <TrackCover track={t} size="sm" href={`/songs/${t.id}`} />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/songs/${t.id}`}
                  className="block truncate text-sm font-medium text-white hover:underline"
                >
                  {trackTitle(t)}
                </Link>
                <p className="truncate text-xs text-white/45">
                  {trackArtist(t)}
                  {t.genre ? ` · ${t.genre}` : ""}
                </p>
              </div>
              {formatTrackDuration(t.duration_secs) ? (
                <span className="shrink-0 text-xs tabular-nums text-white/35">
                  {formatTrackDuration(t.duration_secs)}
                </span>
              ) : null}
              <AddToPlaylist trackId={t.id} compact loginNext={`/songs/${t.id}`} />
              <TrackLikeButton
                trackId={t.id}
                initialLiked={Boolean(likedTracks[t.id])}
                likesReady={likesReady}
                loginNext={loginNext}
                compact
              />
              <QueueTrackButton track={t} compact />
              <ShareTrackButton track={t} compact />
              <button
                type="button"
                disabled={!canPlay}
                title={
                  canPlay
                    ? `Play ${trackTitle(t)}`
                    : "No audio file on this track yet"
                }
                onClick={() => playFromList(t)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1DB954] text-black transition enabled:hover:bg-[#17a349] disabled:cursor-not-allowed disabled:bg-[#1DB954]/30 disabled:text-black/40"
                aria-label={
                  active && playing
                    ? `Pause ${trackTitle(t)}`
                    : `Play ${trackTitle(t)}`
                }
              >
                {active && playing ? "❚❚" : "▶"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
