"use client";

import { FollowPlaylistButton } from "@/components/follow-playlist-button";
import { SavePlaylistButton } from "@/components/save-playlist-button";

type Props = {
  playlistId: string;
  initialFollowing: boolean;
  followsReady: boolean;
  loginNext: string;
};

export function InboxPlaylistActions({
  playlistId,
  initialFollowing,
  followsReady,
  loginNext,
}: Props) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {followsReady ? (
        <FollowPlaylistButton
          playlistId={playlistId}
          initialFollowing={initialFollowing}
          initialCount={0}
          followsReady={followsReady}
          loginNext={loginNext}
          className="[&>button]:px-3 [&>button]:py-1 [&>button]:text-xs"
        />
      ) : null}
      <span className="[&>button]:rounded-full [&>button]:border [&>button]:border-white/20 [&>button]:px-3 [&>button]:py-1 [&>button]:text-xs [&>button]:font-medium [&>button]:text-white/70 hover:[&>button]:bg-white/10">
        <SavePlaylistButton playlistId={playlistId} loginNext={loginNext} />
      </span>
    </div>
  );
}
