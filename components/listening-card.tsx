"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShareTrackButton } from "@/components/share-track-button";
import { TrackPlayButton } from "@/components/track-play-button";
import { trackArtist, trackTitle, formatTrackDuration, type TrackRow } from "@/lib/tracks";

type Props = {
  track: TrackRow;
  artistName: string;
  artistAvatarUrl?: string | null;
};

/**
 * RECT listening card — pretty share surface for one song.
 * Fires analytics events so shares feed royalties / insights later.
 */
export function ListeningCard({
  track,
  artistName,
  artistAvatarUrl = null,
}: Props) {
  const [recorded, setRecorded] = useState(false);

  useEffect(() => {
    if (recorded) return;
    setRecorded(true);
    void fetch("/api/listening-card/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        track_id: track.id,
        event_type: "open_card",
        channel: "listening_card",
      }),
    }).catch(() => {});
  }, [recorded, track.id]);

  const title = trackTitle(track);
  const artist = artistName || trackArtist(track);

  return (
    <article className="listening-card mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#07140c] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
      <div className="relative aspect-square w-full overflow-hidden bg-[#0a1a10]">
        {track.cover_art_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.cover_art_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl text-white/15">
            ♫
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#07140c] via-transparent to-transparent" />
        <p className="absolute left-4 top-4 rounded-full bg-black/45 px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-[var(--rect-sand)] backdrop-blur-sm">
          RECT · Listening card
        </p>
      </div>

      <div className="space-y-4 px-5 pb-6 pt-4">
        <div>
          <h1 className="font-[family-name:var(--font-syne)] text-xl font-semibold tracking-tight text-white">
            {title}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            {artistAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={artistAvatarUrl}
                alt=""
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[0.65rem] text-white/50">
                {artist.slice(0, 1).toUpperCase()}
              </span>
            )}
            <Link
              href={track.artist_id ? `/artists/${track.artist_id}` : "#"}
              className="text-sm text-white/70 hover:text-[var(--rect)]"
            >
              {artist}
            </Link>
          </div>
          <p className="mt-2 text-xs text-white/40">
            {[
              track.genre,
              track.language,
              track.duration_secs
                ? formatTrackDuration(track.duration_secs)
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || "On RECT SOUND"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <TrackPlayButton track={track} />
          <ShareTrackButton
            track={track}
            loginNext={`/songs/${track.id}/card`}
          />
          <Link
            href={`/songs/${track.id}`}
            className="ml-auto text-xs text-white/45 hover:text-white"
          >
            Full page →
          </Link>
        </div>
      </div>
    </article>
  );
}
