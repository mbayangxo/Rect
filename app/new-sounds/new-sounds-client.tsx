"use client";

import Link from "next/link";
import { AddToPlaylist } from "@/components/add-to-playlist";
import { usePlayer } from "@/components/player-provider";
import { QueueTrackButton } from "@/components/queue-track-button";
import { TrackCover } from "@/components/track-cover";
import { TrackLikeButton } from "@/components/track-like-button";
import { formatReleasedAt } from "@/lib/dashboard/new-releases";
import type { NewSoundsTrack } from "@/lib/dashboard/new-sounds";
import { trackArtist, trackTitle, formatTrackDuration } from "@/lib/tracks";

type Props = {
  tracks: NewSoundsTrack[];
  loadError: string | null;
};

export function NewSoundsClient({ tracks, loadError }: Props) {
  const player = usePlayer();
  const playable = tracks.filter((t) => t.audio_url);

  if (loadError) {
    return <p className="text-sm text-[#F5A623]">{loadError}</p>;
  }

  if (tracks.length === 0) {
    return (
      <p className="text-sm text-white/45">
        No New Sounds yet. Artists schedule a launch date on upload — when it
        hits, the song lands here.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {tracks.map((t, i) => (
        <li
          key={t.id}
          className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3"
        >
          <span className="w-6 shrink-0 text-center text-xs tabular-nums text-white/30">
            {i + 1}
          </span>
          <TrackCover track={t} size="sm" href={`/songs/${t.id}`} />
          <div className="min-w-0 flex-1">
            <Link
              href={`/songs/${t.id}`}
              className="block truncate font-medium hover:text-[var(--rect)]"
            >
              {trackTitle(t)}
            </Link>
            <p className="truncate text-xs text-white/40">
              {trackArtist(t)}
              {t.duration_secs
                ? ` · ${formatTrackDuration(t.duration_secs)}`
                : ""}
              {" · "}
              {formatReleasedAt(t.launch_at_display)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <TrackLikeButton trackId={t.id} compact loginNext="/new-sounds" />
            <QueueTrackButton track={t} compact />
            <AddToPlaylist trackId={t.id} compact loginNext="/new-sounds" />
            <button
              type="button"
              disabled={!t.audio_url}
              onClick={() => {
                if (!t.audio_url) return;
                const idx = playable.findIndex((x) => x.id === t.id);
                player.playQueue(playable, idx >= 0 ? idx : 0);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--rect)] text-sm text-black disabled:opacity-30"
              aria-label={`Play ${trackTitle(t)}`}
            >
              ▶
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
