"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { QueueTrackButton } from "@/components/queue-track-button";
import { TrackCover } from "@/components/track-cover";
import { usePlayer } from "@/components/player-provider";
import type { JournalEntry } from "@/lib/dashboard/listening-journal";
import type { LikedTrack } from "@/lib/dashboard/likes";
import { trackArtist, trackTitle, formatTrackDuration, type TrackRow } from "@/lib/tracks";

type RowProps = {
  track: TrackRow;
  subtitle: string;
  initialLiked: boolean;
  likesReady: boolean;
  loginNext: string;
};

function SharedTrackRow({
  track,
  subtitle,
  initialLiked,
  likesReady,
  loginNext,
}: RowProps) {
  const player = usePlayer();
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [likePending, setLikePending] = useState(false);

  useEffect(() => {
    setLiked(initialLiked);
  }, [initialLiked, track.id]);

  const active = player.track?.id === track.id && Boolean(player.track?.audio_url);
  const playing = active && player.playing;
  const canPlay = Boolean(track.audio_url);

  async function toggleLike() {
    if (!likesReady || likePending) return;
    setLikePending(true);
    const prev = liked;
    setLiked(!prev);
    try {
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_id: track.id }),
      });
      const data = (await res.json()) as {
        error?: string;
        liked?: boolean;
      };
      if (res.status === 401) {
        setLiked(prev);
        window.location.href = `/auth/login?next=${encodeURIComponent(loginNext)}`;
        return;
      }
      if (!res.ok || data.error) {
        setLiked(prev);
        return;
      }
      setLiked(Boolean(data.liked));
      router.refresh();
    } catch {
      setLiked(prev);
    } finally {
      setLikePending(false);
    }
  }

  function play() {
    if (!track.audio_url) return;
    if (active && player.playing) {
      player.toggle();
      return;
    }
    player.play(track);
  }

  return (
    <li className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5 last:border-b-0">
      <button
        type="button"
        onClick={() => play()}
        disabled={!canPlay}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-40"
        title={canPlay ? (playing ? "Pause" : "Play") : "No audio"}
      >
        <TrackCover track={track} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium hover:text-[#1DB954]">
            {trackTitle(track)}
            {playing ? (
              <span className="ml-1.5 text-[0.65rem] text-[#1DB954]">▶</span>
            ) : null}
          </p>
          <p className="truncate text-xs text-white/40">{subtitle}</p>
        </div>
      </button>
      <Link
        href={`/songs/${track.id}`}
        className="shrink-0 text-xs text-white/35 hover:text-[#1DB954]"
      >
        Open
      </Link>
      {likesReady ? (
        <button
          type="button"
          disabled={likePending}
          onClick={() => void toggleLike()}
          className={`shrink-0 rounded-full border px-2.5 py-1 text-xs disabled:opacity-50 ${
            liked
              ? "border-[#1DB954]/40 text-[#1DB954] hover:bg-[#1DB954]/10"
              : "border-white/20 text-white/70 hover:bg-white/10"
          }`}
          aria-label={liked ? "Unlike" : "Like"}
        >
          {liked ? "Liked" : "Like"}
        </button>
      ) : null}
      <QueueTrackButton track={track} compact />
    </li>
  );
}

type Props = {
  activity: JournalEntry[];
  likedTracks: LikedTrack[];
  showActivity: boolean;
  showLikes: boolean;
  likedByViewer: Record<string, boolean>;
  likesReady: boolean;
  loginNext: string;
  formatPlayedAt: (iso: string | null) => string;
};

export function PeopleSharedTracks({
  activity,
  likedTracks,
  showActivity,
  showLikes,
  likedByViewer,
  likesReady,
  loginNext,
  formatPlayedAt,
}: Props) {
  return (
    <>
      {showActivity && activity.length > 0 ? (
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
            Listening now
          </h2>
          <ul className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
            {activity.map((e) => {
              const when = formatPlayedAt(e.played_at);
              const dur = formatTrackDuration(e.duration_secs);
              return (
                <SharedTrackRow
                  key={e.play_id}
                  track={e}
                  subtitle={dur ? `${when} · ${dur}` : when}
                  initialLiked={Boolean(likedByViewer[e.id])}
                  likesReady={likesReady}
                  loginNext={loginNext}
                />
              );
            })}
          </ul>
        </section>
      ) : null}

      {showLikes ? (
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
            Liked
          </h2>
          {likedTracks.length === 0 ? (
            <p className="text-sm text-white/40">No liked songs shared yet</p>
          ) : (
            <ul className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
              {likedTracks.map((t) => (
                <SharedTrackRow
                  key={t.id}
                  track={t}
                  subtitle={trackArtist(t)}
                  initialLiked={Boolean(likedByViewer[t.id])}
                  likesReady={likesReady}
                  loginNext={loginNext}
                />
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
}
