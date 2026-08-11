"use client";

import Link from "next/link";
import { ArtistFollowButton } from "@/components/artist-follow-button";
import { InboxPlaylistActions } from "@/components/inbox-playlist-actions";
import { InboxTrackPlay } from "@/components/inbox-track-play";
import type { FollowedArtist } from "@/lib/dashboard/follows";
import type { FollowedPlaylist } from "@/lib/dashboard/playlist-follows";
import type { PlaylistSummary } from "@/lib/dashboard/playlists";
import type { TrackRow } from "@/lib/tracks";

type Props = {
  profilePersonId: string;
  playlists: PlaylistSummary[];
  savedPlaylists: FollowedPlaylist[];
  showSaves: boolean;
  followedArtists: FollowedArtist[];
  showArtists: boolean;
  viewerId: string | null;
  followingArtists: Record<string, boolean>;
  artistFollowsReady: boolean;
  followingPlaylists: Record<string, boolean>;
  playlistFollowsReady: boolean;
  playlistPreviewTracks?: Record<string, TrackRow>;
  loginNext: string;
};

export function PeopleSharedCollections({
  profilePersonId,
  playlists,
  savedPlaylists,
  showSaves,
  followedArtists,
  showArtists,
  viewerId,
  followingArtists,
  artistFollowsReady,
  followingPlaylists,
  playlistFollowsReady,
  playlistPreviewTracks = {},
  loginNext,
}: Props) {
  return (
    <>
      {playlists.length > 0 ? (
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
            Public mixes
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {playlists.map((p) => {
              const isOwn = Boolean(viewerId && viewerId === profilePersonId);
              return (
                <li
                  key={p.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-[#1DB954]/40"
                >
                  <Link
                    href={`/playlists/${p.id}`}
                    className="flex items-center gap-3"
                  >
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
                      {p.cover_art_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.cover_art_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-white/25">
                          ♫
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {p.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-white/40">
                        {p.track_count}{" "}
                        {p.track_count === 1 ? "track" : "tracks"}
                      </span>
                    </span>
                  </Link>
                  {playlistPreviewTracks[p.id] ? (
                    <InboxTrackPlay
                      track={playlistPreviewTracks[p.id]}
                      className="mt-2 rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
                    />
                  ) : null}
                  {!isOwn ? (
                    <InboxPlaylistActions
                      playlistId={p.id}
                      initialFollowing={Boolean(followingPlaylists[p.id])}
                      followsReady={playlistFollowsReady}
                      loginNext={loginNext}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {showSaves ? (
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
            Saved mixes
          </h2>
          {savedPlaylists.length === 0 ? (
            <p className="text-sm text-white/40">No saved mixes shared yet</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {savedPlaylists.map((p) => {
                const isOwn = Boolean(viewerId && p.owner_id === viewerId);
                return (
                  <li
                    key={p.id}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-[#1DB954]/40"
                  >
                    <Link
                      href={`/playlists/${p.id}`}
                      className="flex items-center gap-3"
                    >
                      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
                        {p.cover_art_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.cover_art_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-white/25">
                            ♫
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {p.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-white/40">
                          {p.owner_name}
                          {p.track_count
                            ? ` · ${p.track_count} ${
                                p.track_count === 1 ? "track" : "tracks"
                              }`
                            : ""}
                        </span>
                      </span>
                    </Link>
                    {playlistPreviewTracks[p.id] ? (
                      <InboxTrackPlay
                        track={playlistPreviewTracks[p.id]}
                        className="mt-2 rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
                      />
                    ) : null}
                    {!isOwn ? (
                      <InboxPlaylistActions
                        playlistId={p.id}
                        initialFollowing={Boolean(followingPlaylists[p.id])}
                        followsReady={playlistFollowsReady}
                        loginNext={loginNext}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {showArtists ? (
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
            Artists
          </h2>
          {followedArtists.length === 0 ? (
            <p className="text-sm text-white/40">
              No followed artists shared yet
            </p>
          ) : (
            <ul className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
              {followedArtists.map((a) => {
                const isSelf = Boolean(viewerId && a.id === viewerId);
                return (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-3 py-2.5 last:border-b-0"
                  >
                    <Link
                      href={`/artists/${a.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 hover:text-[#1DB954]"
                    >
                      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
                        {a.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.avatar_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[0.6rem] font-semibold text-[#1DB954]/70">
                            {(a.display_name.trim().slice(0, 2) || "AR").toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {a.display_name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-white/40">
                          {[a.city, a.genres.slice(0, 2).join(" · ")]
                            .filter(Boolean)
                            .join(" · ") || "Artist"}
                        </span>
                      </span>
                    </Link>
                    {!isSelf && artistFollowsReady ? (
                      <ArtistFollowButton
                        artistId={a.id}
                        initialFollowing={Boolean(followingArtists[a.id])}
                        initialCount={0}
                        followsReady={artistFollowsReady}
                        showCount={false}
                        compact
                        className="mt-0 shrink-0"
                        loginNext={loginNext}
                      />
                    ) : (
                      <span className="shrink-0 text-xs text-white/30">→</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
}
