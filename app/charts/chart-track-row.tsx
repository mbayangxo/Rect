"use client";

import { AddToPlaylist } from "@/components/add-to-playlist";
import { usePlayer } from "@/components/player-provider";
import { QueueTrackButton } from "@/components/queue-track-button";
import { ShareTrackButton } from "@/components/share-track-button";
import { TrackCover } from "@/components/track-cover";
import {
  formatPlayCount,
  trackArtist,
  trackTitle,
  type RankedTrack,
} from "@/lib/dashboard/tracks";

export function ChartTrackRow({
  track,
  rank,
}: {
  track: RankedTrack;
  rank: number;
}) {
  const player = usePlayer();
  const canPlay = Boolean(track.audio_url);

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
        onClick={() => {
          if (track.audio_url) player.play(track);
        }}
        className="flex min-w-0 flex-1 items-center gap-3 text-left transition hover:opacity-90 disabled:opacity-40"
      >
        <TrackCover track={track} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {trackTitle(track)}
          </span>
          <span className="block truncate text-xs text-white/40">
            {trackArtist(track)}
            {track.genre ? ` · ${track.genre}` : ""}
          </span>
        </span>
        {canPlay ? (
          <span className="text-xs text-[#1DB954]" aria-hidden>
            ▶
          </span>
        ) : null}
      </button>
      <AddToPlaylist trackId={track.id} compact loginNext="/charts" />
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
