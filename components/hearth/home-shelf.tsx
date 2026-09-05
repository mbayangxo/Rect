"use client";

import Link from "next/link";
import type { TrackRow } from "@/lib/tracks";
import { trackArtist, trackTitle, formatTrackDuration } from "@/lib/tracks";

export type ShelfTrack = TrackRow & {
  subtitle?: string | null;
};

type Props = {
  kicker: string;
  title: string;
  seeAllHref?: string;
  seeAllLabel?: string;
  tracks: ShelfTrack[];
  onPlay: (track: ShelfTrack, index: number) => void;
  emptyHint?: string;
};

/**
 * One Home shelf — title + horizontal cards (Spotify-style composition unit).
 */
export function HomeShelf({
  kicker,
  title,
  seeAllHref,
  seeAllLabel = "See all →",
  tracks,
  onPlay,
  emptyHint,
}: Props) {
  if (tracks.length === 0) {
    if (!emptyHint) return null;
    return (
      <section className="home-shelf" aria-label={title}>
        <div className="home-shelf-head">
          <div>
            <p className="home-shelf-kicker">{kicker}</p>
            <h2 className="home-shelf-title">{title}</h2>
          </div>
        </div>
        <p className="home-shelf-empty">{emptyHint}</p>
      </section>
    );
  }

  return (
    <section className="home-shelf" aria-label={title}>
      <div className="home-shelf-head">
        <div>
          <p className="home-shelf-kicker">{kicker}</p>
          <h2 className="home-shelf-title">{title}</h2>
        </div>
        {seeAllHref ? (
          <Link href={seeAllHref} className="home-shelf-more">
            {seeAllLabel}
          </Link>
        ) : null}
      </div>
      <ul className="home-shelf-rail">
        {tracks.map((t, i) => (
          <li key={`${t.id}-${i}`} className="home-shelf-item">
            <button
              type="button"
              className="home-shelf-card"
              onClick={() => onPlay(t, i)}
              aria-label={`Play ${trackTitle(t)}`}
            >
              <span
                className="home-shelf-art"
                style={
                  t.cover_art_url
                    ? { backgroundImage: `url(${t.cover_art_url})` }
                    : undefined
                }
              >
                <span className="home-shelf-play">▶</span>
              </span>
              <span className="home-shelf-copy">
                <span className="home-shelf-song">{trackTitle(t)}</span>
                <span className="home-shelf-meta">
                  {t.subtitle?.trim() || trackArtist(t)}
                  {formatTrackDuration(t.duration_secs)
                    ? ` · ${formatTrackDuration(t.duration_secs)}`
                    : ""}
                </span>
              </span>
            </button>
            <Link
              href={`/songs/${t.id}/card`}
              className="home-shelf-card-link"
              title="Listening card"
            >
              Card
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
