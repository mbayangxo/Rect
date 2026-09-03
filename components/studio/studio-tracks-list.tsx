"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TrackCover } from "@/components/track-cover";
import { TrackDownloadPriceEditor } from "@/components/studio/track-download-price-editor";
import { TrackLyricsEditor } from "@/components/studio/track-lyrics-editor";
import { TrackWritersEditor } from "@/components/track-writers-editor";
import { TrackEditButton } from "@/components/track-edit-button";
import { TrackPublishToggle } from "@/components/track-publish-toggle";
import { usePlayer } from "@/components/player-provider";
import type { ArtistStatTrack } from "@/lib/dashboard/artist-stats";
import type { WriterSplit } from "@/lib/dashboard/writer-splits";
import { isPublishedTrack, trackTitle } from "@/lib/tracks";

type Props = {
  tracks: ArtistStatTrack[];
  needsPlaces: boolean;
  loadError: string | null;
  focusTrackId?: string | null;
  writersByTrack?: Record<string, WriterSplit[]>;
};

export function StudioTracksList({
  tracks,
  needsPlaces,
  loadError,
  focusTrackId = null,
  writersByTrack = {},
}: Props) {
  const router = useRouter();
  const { track: current, playing, play, toggle } = usePlayer();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function deleteTrack(trackId: string, name: string) {
    if (deletingId) return;
    if (!window.confirm(`Delete “${name}”? This cannot be undone.`)) return;
    setDeletingId(trackId);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/tracks/${trackId}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setDeleteError(data.error || "Could not delete track.");
        return;
      }
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Network error");
    } finally {
      setDeletingId(null);
    }
  }

  if (loadError) {
    return <p className="text-sm text-[#F5A623]">{loadError}</p>;
  }

  if (tracks.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 text-center">
        <p className="text-sm text-white/45">No tracks yet.</p>
        <Link
          href="/studio/upload"
          className="mt-3 inline-block text-sm text-[#1DB954] hover:underline"
        >
          Upload your first song →
        </Link>
      </div>
    );
  }

  return (
    <>
      {deleteError ? (
        <p className="mb-3 text-sm text-[#F5A623]" role="alert">
          {deleteError}
        </p>
      ) : null}
      <ul className="space-y-2">
        {tracks.map((t) => {
          const live = isPublishedTrack(t);
          const focused = focusTrackId === t.id;
          const launchLabel =
            t.launch_at && new Date(t.launch_at).getTime() > Date.now()
              ? ` · Launches ${new Date(t.launch_at).toLocaleString()}`
              : t.launch_at
                ? ` · Launched ${new Date(t.launch_at).toLocaleDateString()}`
                : "";
          return (
            <li
              key={t.id}
              className={`rounded-xl border px-4 py-3 ${
                focused
                  ? "border-[#1DB954]/50 bg-[#1DB954]/[0.08]"
                  : "border-white/[0.08] bg-white/[0.03]"
              }`}
            >
              <div className="flex items-start gap-3">
                <TrackCover track={t} size="sm" href={`/songs/${t.id}`} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/songs/${t.id}`}
                    className="block truncate font-medium hover:text-[#1DB954]"
                  >
                    {trackTitle(t)}
                  </Link>
                  <p className="mt-0.5 text-xs text-white/40">
                    {t.genre || "No genre"}
                    {t.language ? ` · ${t.language}` : ""}
                    {` · ${live ? "Published" : "Draft"}`}
                    {launchLabel}
                    {` · ${t.play_count.toLocaleString()} play${t.play_count === 1 ? "" : "s"}`}
                    {t.download_sales > 0
                      ? ` · ${t.download_sales} download sale${t.download_sales === 1 ? "" : "s"}`
                      : ""}
                    {t.download_price_xof != null && t.download_price_xof > 0
                      ? ` · ${t.download_price_xof.toLocaleString()} XOF download`
                      : ""}
                    {typeof t.lyrics === "string" && t.lyrics.trim()
                      ? " · Lyrics"
                      : ""}
                    {t.isrc_code ? ` · ISRC ${t.isrc_code}` : ""}
                  </p>
                  <TrackDownloadPriceEditor
                    trackId={t.id}
                    initialPriceXof={t.download_price_xof}
                  />
                  <TrackLyricsEditor
                    trackId={t.id}
                    initialLyrics={
                      typeof t.lyrics === "string" ? t.lyrics : null
                    }
                    compact
                  />
                  <TrackWritersEditor
                    trackId={t.id}
                    initialWriters={writersByTrack[t.id] ?? []}
                    compact
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!t.audio_url}
                      onClick={() => {
                        if (!t.audio_url) return;
                        if (current?.id === t.id) toggle();
                        else play(t);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1DB954] text-xs text-black disabled:opacity-30"
                      aria-label={`Play ${trackTitle(t)}`}
                    >
                      {current?.id === t.id && playing ? "❚❚" : "▶"}
                    </button>
                    <TrackEditButton
                      trackId={t.id}
                      title={t.title || ""}
                      genre={t.genre}
                      language={t.language}
                      hasCover={Boolean(t.cover_art_url)}
                      isLive={live}
                    />
                    <TrackPublishToggle
                      trackId={t.id}
                      status={t.status}
                      emphasize={focused && !live}
                      hasCover={Boolean(t.cover_art_url)}
                      genre={t.genre}
                      language={t.language}
                      hasPlaces={!needsPlaces}
                    />
                    {live && t.audio_url ? (
                      <Link
                        href="/studio/delivery"
                        className="rounded-full border border-[#1DB954]/35 px-3 py-1 text-[0.65rem] font-medium text-[#1DB954] hover:bg-[#1DB954]/10"
                      >
                        Add to DSP release
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      disabled={deletingId === t.id}
                      onClick={() => void deleteTrack(t.id, trackTitle(t))}
                      className="rounded-full border border-red-500/30 px-3 py-1 text-[0.65rem] text-red-300/80 hover:border-red-400/50 disabled:opacity-50"
                    >
                      {deletingId === t.id ? "…" : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
