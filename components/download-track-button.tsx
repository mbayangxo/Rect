"use client";

import { useEffect, useState } from "react";
import {
  downloadTrack,
  isTrackDownloaded,
  removeOfflineTrack,
} from "@/lib/offline/track-downloads";
import type { TrackRow } from "@/lib/tracks";
import { trackTitle } from "@/lib/tracks";

type Props = {
  track: TrackRow;
  compact?: boolean;
  onChange?: () => void;
  /** When true, fetch audio via /api/tracks/[id]/download (paid tracks). */
  useEntitlementApi?: boolean;
};

export function DownloadTrackButton({
  track,
  compact = false,
  onChange,
  useEntitlementApi = false,
}: Props) {
  const [downloaded, setDownloaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void isTrackDownloaded(track.id).then(setDownloaded);
  }, [track.id, track.audio_url]);

  async function onDownload() {
    if (pending) return;
    setPending(true);
    setError(null);
    setProgress(0);
    try {
      await downloadTrack(track, setProgress, { useEntitlementApi });
      setDownloaded(true);
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setPending(false);
      window.setTimeout(() => setProgress(null), 800);
    }
  }

  async function onRemove() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await removeOfflineTrack(track.id);
      setDownloaded(false);
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove download");
    } finally {
      setPending(false);
    }
  }

  const label = pending
    ? progress != null && progress < 100
      ? `${progress}%`
      : "…"
    : downloaded
      ? "Saved"
      : "Download";

  if (compact) {
    return (
      <div className="relative shrink-0">
        <button
          type="button"
          disabled={pending}
          onClick={() => void (downloaded ? onRemove() : onDownload())}
          className="flex h-9 w-9 items-center justify-center rounded-full text-xs text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-40"
          title={
            downloaded
              ? `Remove offline copy of ${trackTitle(track)}`
              : `Download ${trackTitle(track)} for offline`
          }
          aria-label={
            downloaded
              ? `Remove offline copy of ${trackTitle(track)}`
              : `Download ${trackTitle(track)} for offline`
          }
        >
          {downloaded ? "✓" : "↓"}
        </button>
        {error ? (
          <span className="sr-only" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        disabled={pending}
        onClick={() => void (downloaded ? onRemove() : onDownload())}
        className="rounded-full border border-white/20 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-white/70 hover:bg-white/10 disabled:opacity-50"
      >
        {label}
      </button>
      {error ? (
        <p className="mt-1 max-w-[9rem] text-[0.6rem] text-[#F5A623]">{error}</p>
      ) : null}
    </div>
  );
}
