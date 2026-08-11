"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArtistFollowButton } from "@/components/artist-follow-button";
import { usePlayer } from "@/components/player-provider";
import type { TrackRow } from "@/lib/tracks";

type Props = {
  trackId: string;
  track: TrackRow | null;
  artistId: string | null;
  initialLiked: boolean;
  likesReady: boolean;
  initialFollowing: boolean;
  followsReady: boolean;
  loginNext: string;
};

export function InboxReleaseActions({
  trackId,
  track,
  artistId,
  initialLiked,
  likesReady,
  initialFollowing,
  followsReady,
  loginNext,
}: Props) {
  const player = usePlayer();
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [likePending, setLikePending] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);

  useEffect(() => {
    setLiked(initialLiked);
  }, [initialLiked, trackId]);

  const active =
    player.track?.id === trackId && Boolean(player.track?.audio_url);
  const playing = active && player.playing;
  const canPlay = Boolean(track?.audio_url);

  async function toggleLike() {
    if (!likesReady || likePending) return;
    setLikePending(true);
    const prev = liked;
    setLiked(!prev);
    try {
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_id: trackId }),
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
    setPlayError(null);
    if (!track?.audio_url) {
      setPlayError("Audio not ready");
      return;
    }
    if (active && player.playing) {
      player.toggle();
      return;
    }
    player.play(track);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={!canPlay}
        onClick={() => play()}
        className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 hover:bg-white/10 disabled:opacity-40"
        title={canPlay ? (playing ? "Pause" : "Play") : "No audio"}
      >
        {playing ? "Pause" : "Play"}
      </button>
      {likesReady ? (
        <button
          type="button"
          disabled={likePending}
          onClick={() => void toggleLike()}
          className={`rounded-full border px-3 py-1 text-xs disabled:opacity-50 ${
            liked
              ? "border-[#1DB954]/40 text-[#1DB954] hover:bg-[#1DB954]/10"
              : "border-white/20 text-white/70 hover:bg-white/10"
          }`}
          aria-label={liked ? "Unlike" : "Like"}
        >
          {liked ? "Liked" : "Like"}
        </button>
      ) : null}
      {artistId && followsReady ? (
        <ArtistFollowButton
          artistId={artistId}
          initialFollowing={initialFollowing}
          initialCount={0}
          followsReady={followsReady}
          showCount={false}
          compact
          className="mt-0"
          loginNext={loginNext}
        />
      ) : null}
      {playError ? (
        <span className="text-xs text-[#F5A623]" role="alert">
          {playError}
        </span>
      ) : null}
    </div>
  );
}
