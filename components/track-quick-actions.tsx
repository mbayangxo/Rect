"use client";

import Link from "next/link";
import { AddToPlaylist } from "@/components/add-to-playlist";
import { TrackLikeButton } from "@/components/track-like-button";

type Props = {
  trackId: string;
  initialLiked: boolean;
  likesReady: boolean;
  loginNext?: string;
  /** Tighter row for cards and lists. */
  compact?: boolean;
};

/**
 * Save (heart), add to a mix, open song page / journal context.
 * Likes = saved songs in Library; plays auto-log to the listening journal.
 */
export function TrackQuickActions({
  trackId,
  initialLiked,
  likesReady,
  loginNext = "/dashboard",
  compact = true,
}: Props) {
  return (
    <div
      className={
        compact
          ? "flex items-center gap-0.5"
          : "flex flex-wrap items-center gap-2"
      }
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <TrackLikeButton
        trackId={trackId}
        initialLiked={initialLiked}
        likesReady={likesReady}
        loginNext={loginNext}
        compact
      />
      <AddToPlaylist
        trackId={trackId}
        compact
        loginNext={loginNext}
      />
      <Link
        href={`/songs/${trackId}`}
        className={
          compact
            ? "rounded-full px-2 py-1.5 text-[0.65rem] font-medium text-white/45 hover:bg-white/10 hover:text-white"
            : "rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/60 hover:border-[#1DB954]/40 hover:text-white"
        }
        title="Song page — lyrics, comments, journal"
      >
        Song
      </Link>
      <Link
        href="/journal"
        className={
          compact
            ? "hidden rounded-full px-2 py-1.5 text-[0.65rem] font-medium text-white/45 hover:bg-white/10 hover:text-white sm:inline"
            : "rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/60 hover:border-[#1DB954]/40 hover:text-white"
        }
        title="Listening journal — plays log here automatically"
      >
        Journal
      </Link>
    </div>
  );
}
