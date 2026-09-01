"use client";

import Link from "next/link";
import { TrackQuickActions } from "@/components/track-quick-actions";
import { genreToSlug } from "@/lib/dashboard/genres";
import { placeToSlug } from "@/lib/dashboard/places";
import {
  formatPlayCount,
  trackArtist,
  trackTitle,
  type RankedTrack,
} from "@/lib/dashboard/tracks";
import { formatTrackDuration } from "@/lib/tracks";

type Props = {
  tracks: RankedTrack[];
  personalized: boolean;
  tasteGenres: string[];
  tasteCountries: string[];
  tasteDaypart?: string | null;
  likedTrackIds: Set<string>;
  likesReady: boolean;
  onPlay: (track: RankedTrack) => void;
};

export function HearthTrackGrid({
  tracks,
  personalized,
  tasteGenres,
  tasteCountries,
  tasteDaypart = null,
  likedTrackIds,
  likesReady,
  onPlay,
}: Props) {
  return (
    <div className="hearth-tracks">
      <div className="hearth-zone-head">
        <div>
          <p className="hearth-zone-kicker">Listen</p>
          <h2 className="hearth-zone-title">
            {personalized ? "Picked for you" : "On RECT now"}
          </h2>
        </div>
        <Link href="/radio" className="hearth-zone-link">
          Wave →
        </Link>
      </div>

      {personalized &&
      (tasteGenres.length > 0 ||
        tasteCountries.length > 0 ||
        tasteDaypart) ? (
        <p className="hearth-taste-line">
          <span>Tuned to</span>
          {tasteGenres.map((g, i) => {
            const slug = genreToSlug(g);
            return (
              <span key={`g-${g}`} className="hearth-taste-chip">
                {i > 0 ? <span aria-hidden>·</span> : null}
                {slug ? (
                  <Link href={`/genres/${slug}`}>{g}</Link>
                ) : (
                  <span>{g}</span>
                )}
              </span>
            );
          })}
          {tasteCountries.map((c, i) => {
            const slug = placeToSlug(c);
            return (
              <span key={`c-${c}`} className="hearth-taste-chip">
                {(tasteGenres.length > 0 || i > 0) && (
                  <span aria-hidden>·</span>
                )}
                {slug ? (
                  <Link href={`/places/${slug}`}>{c}</Link>
                ) : (
                  <span>{c}</span>
                )}
              </span>
            );
          })}
          {tasteDaypart ? (
            <span className="hearth-taste-chip">
              <span aria-hidden>·</span>
              <span>{tasteDaypart}</span>
            </span>
          ) : null}
        </p>
      ) : null}

      <div className="hearth-track-grid">
        {tracks.slice(0, 8).map((t, i) => (
          <article
            key={t.id}
            className="hearth-track-card"
            style={{ animationDelay: `${i * 45}ms` }}
          >
            <button
              type="button"
              className="hearth-track-hit"
              onClick={() => onPlay(t)}
              aria-label={`Play ${trackTitle(t)}`}
            >
              <div
                className="hearth-track-art"
                style={
                  t.cover_art_url
                    ? { backgroundImage: `url(${t.cover_art_url})` }
                    : undefined
                }
              >
                <span className="hearth-track-play">▶</span>
                {t.play_count > 0 ? (
                  <span className="hearth-track-plays">
                    {formatPlayCount(t.play_count)}
                  </span>
                ) : null}
              </div>
            </button>
            <div className="hearth-track-body">
              <Link href={`/songs/${t.id}`} className="hearth-track-title">
                {trackTitle(t)}
              </Link>
              <p className="hearth-track-meta">
                {trackArtist(t)}
                {formatTrackDuration(t.duration_secs)
                  ? ` · ${formatTrackDuration(t.duration_secs)}`
                  : ""}
              </p>
              <TrackQuickActions
                trackId={t.id}
                initialLiked={likedTrackIds.has(t.id)}
                likesReady={likesReady}
                loginNext="/dashboard"
              />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
