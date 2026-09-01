"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AddToPlaylist } from "@/components/add-to-playlist";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { DownloadTrackButton } from "@/components/download-track-button";
import { usePlayer } from "@/components/player-provider";
import { RectLogo } from "@/components/rect-logo";
import { QueueTrackButton } from "@/components/queue-track-button";
import { ShareTrackButton } from "@/components/share-track-button";
import { TrackCover } from "@/components/track-cover";
import type { LikedTrack } from "@/lib/dashboard/likes";
import type { FollowedPlaylist } from "@/lib/dashboard/playlist-follows";
import type { PlaylistSummary } from "@/lib/dashboard/playlists";
import {
  formatBytes,
  listOfflineTracks,
  syncStaleDownloads,
  type OfflineTrackMeta,
} from "@/lib/offline/track-downloads";
import { trackArtist, trackTitle, formatTrackDuration, type TrackRow } from "@/lib/tracks";

type Props = {
  initialTracks: LikedTrack[];
  loadError: string | null;
  missingTable: boolean;
  /** True when privacy_show_likes is off (default). */
  likesHidden?: boolean;
  ownedPlaylists?: PlaylistSummary[];
  ownedError?: string | null;
  ownedMissing?: boolean;
  savedPlaylists?: FollowedPlaylist[];
  savedError?: string | null;
  savedMissing?: boolean;
  playlistPreviewTracks?: Record<string, TrackRow>;
};

function MixCard({
  href,
  name,
  meta,
  preview,
  coverUrl,
}: {
  href: string;
  name: string;
  meta: string;
  preview?: TrackRow | null;
  coverUrl?: string | null;
}) {
  return (
    <Link
      href={href}
      className="group flex w-[148px] shrink-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] text-left transition hover:border-white/25"
    >
      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-[#0a2e18] to-[#060908]">
        {coverUrl || preview?.cover_art_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl || preview?.cover_art_url || ""}
            alt=""
            className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100"
          />
        ) : preview ? (
          <div className="flex h-full items-center justify-center p-4">
            <TrackCover track={preview} size="md" href={`/songs/${preview.id}`} />
          </div>
        ) : (
          <div className="flex h-full items-end p-3">
            <span className="text-[0.55rem] font-bold uppercase tracking-wide text-[#1DB954]/80">
              Mix
            </span>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="mt-0.5 truncate text-[0.65rem] text-white/40">{meta}</p>
      </div>
    </Link>
  );
}

export function LibraryClient({
  initialTracks,
  loadError,
  missingTable,
  likesHidden = true,
  ownedPlaylists = [],
  ownedError = null,
  ownedMissing = false,
  savedPlaylists = [],
  savedError = null,
  savedMissing = false,
  playlistPreviewTracks = {},
}: Props) {
  const router = useRouter();
  const player = usePlayer();
  const [tracks, setTracks] = useState(initialTracks);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [savingPlaylist, setSavingPlaylist] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineTracks, setOfflineTracks] = useState<OfflineTrackMeta[]>([]);

  useEffect(() => {
    setTracks(initialTracks);
  }, [initialTracks]);

  useEffect(() => {
    void listOfflineTracks().then(setOfflineTracks);
  }, []);

  useEffect(() => {
    const onOnline = () => {
      void syncStaleDownloads(tracks).then(({ updated }) => {
        if (updated > 0) void listOfflineTracks().then(setOfflineTracks);
      });
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [tracks]);

  const playable = tracks.filter((t) => t.audio_url);
  const ownedPreview = ownedPlaylists.slice(0, 8);
  const savedPreview = savedPlaylists.slice(0, 8);

  async function unlike(trackId: string) {
    setPendingId(trackId);
    setError(null);
    const prev = tracks;
    setTracks((list) => list.filter((t) => t.id !== trackId));
    try {
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_id: trackId }),
      });
      const data = (await res.json()) as { error?: string; liked?: boolean };
      if (!res.ok || data.error) {
        setTracks(prev);
        setError(data.error || "Could not update like");
        return;
      }
      if (data.liked) {
        setTracks(prev);
        setError("Could not unlike — try again");
        return;
      }
      router.refresh();
    } catch (e) {
      setTracks(prev);
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPendingId(null);
    }
  }

  async function clearLikes() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    if (clearing) return;
    setClearing(true);
    setError(null);
    const prev = tracks;
    setTracks([]);
    try {
      const res = await fetch("/api/likes", { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setTracks(prev);
        setError(data.error || "Could not clear likes");
        setConfirmClear(false);
        return;
      }
      setConfirmClear(false);
      router.refresh();
    } catch (e) {
      setTracks(prev);
      setError(e instanceof Error ? e.message : "Network error");
      setConfirmClear(false);
    } finally {
      setClearing(false);
    }
  }

  async function saveAsPlaylist() {
    if (savingPlaylist || tracks.length === 0) return;
    setSavingPlaylist(true);
    setError(null);
    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Liked songs",
          track_ids: tracks.map((t) => t.id),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        playlist?: { id: string };
      };
      if (!res.ok || data.error || !data.playlist?.id) {
        setError(data.error || "Could not save playlist");
        return;
      }
      router.push(`/playlists/${data.playlist.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSavingPlaylist(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#040d06] pb-28 text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/dashboard">
            <RectLogo size={34} showWordmark />
          </Link>
          <p className="text-sm font-medium text-[#1DB954]">Library</p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-10 px-5 py-10 sm:px-8">
        <div>
          <h1 className="font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
            Your library
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/45">
            Saved songs, mixes, journal, and people you follow.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Link href="#liked" className="app-hub-tile">
              <span className="app-hub-tile-k">Saved</span>
              <span className="app-hub-tile-t">Liked songs</span>
            </Link>
            <Link href="/playlists" className="app-hub-tile">
              <span className="app-hub-tile-k">Curate</span>
              <span className="app-hub-tile-t">Your mixes</span>
            </Link>
            <Link href="/journal" className="app-hub-tile">
              <span className="app-hub-tile-k">History</span>
              <span className="app-hub-tile-t">Journal</span>
            </Link>
            <Link href="/following" className="app-hub-tile">
              <span className="app-hub-tile-k">People</span>
              <span className="app-hub-tile-t">Following</span>
            </Link>
          </div>
        </div>

        {/* Your mixes */}
        <section id="your-mixes">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
              Your mixes
            </h2>
            <Link
              href="/playlists"
              className="text-xs text-[#1DB954] hover:underline"
            >
              All playlists
            </Link>
          </div>
          {ownedMissing ? (
            <p className="text-sm text-white/40">
              Playlists not set up yet — run playlists SQL in Supabase.
            </p>
          ) : ownedError ? (
            <p className="text-sm text-[#F5A623]">{ownedError}</p>
          ) : ownedPreview.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center">
              <p className="text-sm text-white/45">No mixes yet.</p>
              <Link
                href="/playlists"
                className="mt-3 inline-block text-sm text-[#1DB954] hover:underline"
              >
                Create a playlist
              </Link>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
              {ownedPreview.map((p) => (
                <MixCard
                  key={p.id}
                  href={`/playlists/${p.id}`}
                  name={p.name}
                  meta={`${p.track_count} track${p.track_count === 1 ? "" : "s"}${
                    p.is_public ? " · Public" : " · Private"
                  }`}
                  preview={playlistPreviewTracks[p.id]}
                  coverUrl={p.cover_art_url}
                />
              ))}
            </div>
          )}
        </section>

        {/* Saved mixes */}
        <section id="saved-mixes">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
              Saved mixes
            </h2>
            <Link
              href="/playlists"
              className="text-xs text-[#1DB954] hover:underline"
            >
              Open playlists
            </Link>
          </div>
          {savedMissing ? (
            <p className="text-sm text-white/40">
              Saved mixes not set up yet.
            </p>
          ) : savedError ? (
            <p className="text-sm text-[#F5A623]">{savedError}</p>
          ) : savedPreview.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center">
              <p className="text-sm text-white/45">
                Save a friend’s mix from their playlist page — it shows up here.
              </p>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
              {savedPreview.map((p) => (
                <MixCard
                  key={p.id}
                  href={`/playlists/${p.id}`}
                  name={p.name}
                  meta={`by ${p.owner_name} · ${p.track_count} track${
                    p.track_count === 1 ? "" : "s"
                  }`}
                  preview={playlistPreviewTracks[p.id]}
                  coverUrl={p.cover_art_url}
                />
              ))}
            </div>
          )}
        </section>

        {/* Offline downloads */}
        <section id="downloads" className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
              Downloaded for offline
            </h2>
            <p className="mt-2 text-sm text-white/45">
              Saves to this device — plays without using data. Updates when you’re
              back online if a track changes.
            </p>
          </div>
          {offlineTracks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center">
              <p className="text-sm text-white/40">
                No downloads yet. Tap ↓ on any liked song to save it offline.
              </p>
            </div>
          ) : (
            <ul className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              {offlineTracks.map((o) => (
                <li
                  key={o.trackId}
                  className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{o.title}</p>
                    <p className="truncate text-xs text-white/40">
                      {o.artistName} · {formatBytes(o.bytes)}
                    </p>
                  </div>
                  <Link
                    href={`/songs/${o.trackId}`}
                    className="shrink-0 text-xs text-[#1DB954] hover:underline"
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Liked songs */}
        <section id="liked" className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
                Liked songs
              </h2>
              <p className="mt-2 text-sm text-white/45">
                Tracks you heart on RECT SOUND — saved in your account.
              </p>
              {likesHidden ? (
                <p className="mt-3 max-w-xl rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/50">
                  Your likes stay off your public page.{" "}
                  <Link
                    href="/profile"
                    className="text-[#1DB954] hover:underline"
                  >
                    Turn on Liked songs
                  </Link>{" "}
                  in Profile if you want friends to see them.
                </p>
              ) : (
                <p className="mt-2 text-sm text-white/40">
                  Shared on your public page. Change anytime in{" "}
                  <Link
                    href="/profile"
                    className="text-[#1DB954] hover:underline"
                  >
                    Privacy settings
                  </Link>
                  .
                </p>
              )}
            </div>
            {!missingTable && tracks.length > 0 ? (
              <button
                type="button"
                disabled={clearing}
                onClick={() => void clearLikes()}
                onBlur={() => {
                  if (!clearing) setConfirmClear(false);
                }}
                className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/45 hover:border-red-400/40 hover:text-red-300 disabled:opacity-50"
              >
                {clearing
                  ? "Clearing…"
                  : confirmClear
                    ? "Confirm clear all"
                    : "Clear likes"}
              </button>
            ) : null}
          </div>

          {missingTable ? (
            <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
              <p className="text-base font-medium">Likes not enabled yet</p>
              <p className="mt-2 text-sm text-white/40">
                Run the track likes SQL in Supabase, then heart songs from Home.
              </p>
            </div>
          ) : loadError ? (
            <p className="rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-4 py-3 text-sm text-[#1DB954]">
              Could not load likes. {loadError}
            </p>
          ) : tracks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
              <p className="text-base font-medium">No liked songs yet</p>
              <p className="mt-2 text-sm text-white/40">
                Tap ♥ on a track in Home to save it here.
              </p>
              <Link
                href="/dashboard"
                className="mt-6 inline-block rounded-full bg-[#1DB954] px-5 py-2 text-sm font-semibold text-black"
              >
                Go to Home
              </Link>
            </div>
          ) : (
            <>
              {error ? (
                <p className="text-sm text-[#F5A623]" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {playable.length > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => player.playQueue(playable, 0)}
                      className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-semibold text-black hover:bg-[#17a349]"
                    >
                      ▶ Play all
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        player.playQueue(playable, 0, {
                          shuffle: true,
                          repeat: true,
                        })
                      }
                      className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10"
                    >
                      ⇄ Shuffle
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  disabled={savingPlaylist}
                  onClick={() => void saveAsPlaylist()}
                  className="rounded-full border border-white/20 px-4 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 disabled:opacity-50"
                >
                  {savingPlaylist ? "Saving…" : "Save as playlist"}
                </button>
                <p className="text-xs text-white/40">
                  {tracks.length} song{tracks.length === 1 ? "" : "s"}
                </p>
              </div>

              <ul className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                {tracks.map((t, i) => {
                  const active = player.track?.id === t.id;
                  const canPlay = Boolean(t.audio_url);
                  const queueIdx = playable.findIndex((x) => x.id === t.id);
                  return (
                    <li
                      key={t.id}
                      className={`flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 last:border-0 ${
                        active ? "bg-[#1DB954]/10" : ""
                      }`}
                    >
                      <span className="w-6 shrink-0 text-center text-xs tabular-nums text-white/35">
                        {i + 1}
                      </span>
                      <TrackCover track={t} size="sm" href={`/songs/${t.id}`} />
                      <button
                        type="button"
                        disabled={!canPlay}
                        onClick={() => {
                          if (!canPlay) return;
                          if (active) player.toggle();
                          else
                            player.playQueue(playable, Math.max(0, queueIdx));
                        }}
                        className="min-w-0 flex-1 text-left disabled:opacity-40"
                      >
                        <span className="block truncate text-sm font-medium">
                          {trackTitle(t)}
                        </span>
                        <span className="block truncate text-xs text-white/40">
                          {trackArtist(t)}
                          {t.genre ? ` · ${t.genre}` : ""}
                        </span>
                      </button>
                      {formatTrackDuration(t.duration_secs) ? (
                        <span className="shrink-0 text-xs tabular-nums text-white/35">
                          {formatTrackDuration(t.duration_secs)}
                        </span>
                      ) : null}
                      <AddToPlaylist
                        trackId={t.id}
                        compact
                        loginNext="/library"
                      />
                      <QueueTrackButton track={t} compact />
                      <DownloadTrackButton
                        track={t}
                        compact
                        useEntitlementApi
                        onChange={() => {
                          void listOfflineTracks().then(setOfflineTracks);
                        }}
                      />
                      <ShareTrackButton track={t} compact />
                      <button
                        type="button"
                        disabled={pendingId === t.id}
                        onClick={() => void unlike(t.id)}
                        className="shrink-0 px-2 text-lg text-[#1DB954] disabled:opacity-40"
                        aria-label={`Unlike ${trackTitle(t)}`}
                        title="Unlike"
                      >
                        ♥
                      </button>
                      <button
                        type="button"
                        disabled={!canPlay}
                        onClick={() => {
                          if (!canPlay) return;
                          if (active) player.toggle();
                          else
                            player.playQueue(playable, Math.max(0, queueIdx));
                        }}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1DB954] text-sm font-bold text-black disabled:opacity-40"
                        aria-label={
                          active && player.playing ? "Pause" : "Play"
                        }
                      >
                        {active && player.playing ? "❚❚" : "▶"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>
      <AppBottomNav />
    </main>
  );
}
