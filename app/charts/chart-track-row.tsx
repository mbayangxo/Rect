"use client";

import Link from "next/link";
import { AddToPlaylist } from "@/components/add-to-playlist";
import { usePlayer } from "@/components/player-provider";
import { QueueTrackButton } from "@/components/queue-track-button";
import { ShareTrackButton } from "@/components/share-track-button";
import { TrackCover } from "@/components/track-cover";
import { TrackLikeButton } from "@/components/track-like-button";
import {
  formatPlayCount,
  trackArtist,
  trackTitle,
  type RankedTrack,
} from "@/lib/dashboard/tracks";
import { formatTrackDuration } from "@/lib/tracks";

export function ChartTrackRow({
  track,
  rank,
  queue,
  initialLiked = false,
  likesReady = false,
}: {
  track: RankedTrack;
  rank: number;
  /** Playable board order for continuous listen. */
  queue: RankedTrack[];
  initialLiked?: boolean;
  likesReady?: boolean;
}) {
  const player = usePlayer();
  const canPlay = Boolean(track.audio_url);

  function playFromBoard() {
    if (!track.audio_url) return;
    const idx = queue.findIndex((x) => x.id === track.id);
    player.playQueue(queue, idx >= 0 ? idx : 0);
  }

  const artistHref = track.artist_id ? `/artists/${track.artist_id}` : null;

  return (
    <li className="flex items-center gap-3 border-b border-white/[0.04] py-3 last:border-0">
      <span
        className={`w-6 text-center text-sm font-bold tabular-nums ${
          rank === 1
            ? "text-[#F5A623]"
            : rank === 2
              ? "text-white/55"
              : rank === 3
                ? "text-[#A07040]"
                : "text-white/30"
        }`}
      >
        {rank}
      </span>
      <button
        type="button"
        disabled={!canPlay}
        onClick={playFromBoard}
        className="shrink-0 transition hover:opacity-90 disabled:opacity-40"
        aria-label={`Play ${trackTitle(track)}`}
      >
        <TrackCover track={track} size="sm" />
      </button>
      <span className="min-w-0 flex-1">
        <Link
          href={`/songs/${track.id}`}
          className="block truncate text-sm font-medium hover:text-[#1DB954]"
        >
          {trackTitle(track)}
        </Link>
        {artistHref ? (
          <Link
            href={artistHref}
            className="block truncate text-xs text-white/40 hover:text-white/70"
          >
            {trackArtist(track)}
            {track.genre ? ` · ${track.genre}` : ""}
            {formatTrackDuration(track.duration_secs)
              ? ` · ${formatTrackDuration(track.duration_secs)}`
              : ""}
          </Link>
        ) : (
          <span className="block truncate text-xs text-white/40">
            {trackArtist(track)}
            {track.genre ? ` · ${track.genre}` : ""}
            {formatTrackDuration(track.duration_secs)
              ? ` · ${formatTrackDuration(track.duration_secs)}`
              : ""}
          </span>
        )}
      </span>
      {canPlay ? (
        <button
          type="button"
          onClick={playFromBoard}
          className="text-xs text-[#1DB954] hover:opacity-80"
          aria-label={`Play ${trackTitle(track)}`}
        >
          ▶
        </button>
      ) : null}
      <AddToPlaylist trackId={track.id} compact loginNext="/charts" />
      <TrackLikeButton
        trackId={track.id}
        initialLiked={initialLiked}
        likesReady={likesReady}
        loginNext="/charts"
        compact
      />
      <QueueTrackButton track={track} compact />
      <ShareTrackButton track={track} compact />
      <span className="shrink-0 text-right text-xs tabular-nums text-white/35">
        <span className="block">{formatPlayCount(track.play_count)} plays</span>
        {(track.like_count ?? 0) > 0 ? (
          <span className="block text-white/25">
            {formatPlayCount(track.like_count)} likes
          </span>
        ) : null}
      </span>
    </li>
  );
}
