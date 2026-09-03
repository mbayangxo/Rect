"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AddToFanChart } from "@/components/add-to-fan-chart";
import { AddToPlaylist } from "@/components/add-to-playlist";
import { ArtistTipButton } from "@/components/artist-tip-button";
import { PlayerFollowButton } from "@/components/player-follow-button";
import { PlayerLikeButton } from "@/components/player-like-button";
import { ShareTrackButton } from "@/components/share-track-button";
import { PRIVATE_ARTIST_LABEL } from "@/lib/dashboard/privacy";
import { trackArtist, trackTitle, type TrackRow } from "@/lib/tracks";

type LiveHint = {
  kind: "live_room" | "rect_live";
  href: string;
  title: string;
};

type PortalHint = {
  href: string;
  title: string;
};

type Props = {
  track: TrackRow;
  playing: boolean;
  currentTime: number;
  duration: number;
  canPrev: boolean;
  canNext: boolean;
  onClose: () => void;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (t: number) => void;
};

function formatClock(secs: number) {
  if (!Number.isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function splitLyricLines(lyrics: string | null | undefined): string[] {
  if (!lyrics?.trim()) return [];
  return lyrics
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Immersive Now Playing — full-bleed stage with karaoke-style lyrics
 * and RECT-only side doors (portal, live, tip, fan chart, writers).
 */
export function ImmersiveStage({
  track,
  playing,
  currentTime,
  duration,
  canPrev,
  canNext,
  onClose,
  onToggle,
  onPrev,
  onNext,
  onSeek,
}: Props) {
  const lines = useMemo(
    () => splitLyricLines(track.lyrics),
    [track.lyrics],
  );
  const activeLine = useMemo(() => {
    if (lines.length === 0 || duration <= 0) return -1;
    const pct = Math.min(1, Math.max(0, currentTime / duration));
    return Math.min(lines.length - 1, Math.floor(pct * lines.length));
  }, [lines, currentTime, duration]);

  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const [liveHint, setLiveHint] = useState<LiveHint | null>(null);
  const [portalHint, setPortalHint] = useState<PortalHint | null>(null);
  const [writers, setWriters] = useState<
    { writer_name: string; share_percent: number }[]
  >([]);

  useEffect(() => {
    if (activeLine < 0) return;
    lineRefs.current[activeLine]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [activeLine]);

  useEffect(() => {
    const artistId = track.artist_id;
    if (!artistId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/tracks/${track.id}/immerse?artist_id=${encodeURIComponent(artistId)}`,
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          live?: LiveHint | null;
          portal?: PortalHint | null;
          writers?: { writer_name: string; share_percent: number }[];
          lyrics?: string | null;
        };
        if (cancelled) return;
        setLiveHint(data.live ?? null);
        setPortalHint(data.portal ?? null);
        setWriters(data.writers ?? []);
      } catch {
        /* optional enrichments */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [track.id, track.artist_id]);

  const pct =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const cover = track.cover_art_url;
  const artist = trackArtist(track);
  const privateArtist = artist === PRIVATE_ARTIST_LABEL;

  return (
    <div
      className="immersion-root"
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
    >
      <div
        className="immersion-bg"
        style={
          cover
            ? { backgroundImage: `url(${cover})` }
            : undefined
        }
        aria-hidden
      />
      <div className="immersion-veil" aria-hidden />
      <div className="immersion-orb immersion-orb-a" aria-hidden />
      <div className="immersion-orb immersion-orb-b" aria-hidden />

      <header className="immersion-top">
        <button
          type="button"
          className="immersion-close"
          onClick={onClose}
          aria-label="Close immersive player"
        >
          ↓
        </button>
        <div className="immersion-top-meta">
          <p className="immersion-eyebrow">Now playing</p>
          <p className="immersion-now">
            {playing ? "Playing" : "Paused"}
            {lines.length > 0 ? " · Lyrics" : ""}
          </p>
        </div>
        <Link href={`/songs/${track.id}/card`} className="immersion-song-link">
          Card
        </Link>
      </header>

      <div className="immersion-body">
        <div className="immersion-art-col">
          <div
            className={`immersion-vinyl ${playing ? "spin" : ""}`}
            style={
              cover ? { backgroundImage: `url(${cover})` } : undefined
            }
          >
            <span className="immersion-vinyl-hole" />
          </div>
          <h1 className="immersion-title">{trackTitle(track)}</h1>
          {track.artist_id && !privateArtist ? (
            <Link
              href={`/artists/${track.artist_id}`}
              className="immersion-artist"
            >
              {artist}
            </Link>
          ) : (
            <p className="immersion-artist">{artist}</p>
          )}
          <p className="immersion-context">
            {[track.genre, track.language].filter(Boolean).join(" · ") ||
              "On RECT"}
          </p>

          {/* RECT-only doors — not on Spotify */}
          <div className="immersion-doors">
            {liveHint ? (
              <Link href={liveHint.href} className="immersion-door live">
                <span className="immersion-door-k">Live now</span>
                <span className="immersion-door-t">{liveHint.title}</span>
              </Link>
            ) : null}
            {portalHint ? (
              <Link href={portalHint.href} className="immersion-door portal">
                <span className="immersion-door-k">Portal</span>
                <span className="immersion-door-t">{portalHint.title}</span>
              </Link>
            ) : null}
            <Link href={`/songs/${track.id}`} className="immersion-door">
              <span className="immersion-door-k">Deeper</span>
              <span className="immersion-door-t">Comments & world</span>
            </Link>
          </div>

          {writers.length > 0 ? (
            <div className="immersion-writers">
              <p className="immersion-writers-k">Writers · splits</p>
              <ul>
                {writers.slice(0, 4).map((w, i) => (
                  <li key={`${w.writer_name}-${i}`}>
                    <span>{w.writer_name}</span>
                    <span>{w.share_percent}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="immersion-lyrics-col">
          {lines.length > 0 ? (
            <>
              <p className="immersion-lyrics-kicker">Lyrics</p>
              <div className="immersion-lyrics-scroll">
              {lines.map((line, i) => (
                <p
                  key={`${i}-${line.slice(0, 12)}`}
                  ref={(el) => {
                    lineRefs.current[i] = el;
                  }}
                  className={`immersion-line${
                    i === activeLine ? " on" : ""
                  }${i < activeLine ? " past" : ""}`}
                >
                  {line}
                </p>
              ))}
              </div>
            </>
          ) : (
            <div className="immersion-lyrics-empty">
              <p className="immersion-lyrics-empty-t">No lyrics yet</p>
              <p className="immersion-lyrics-empty-b">
                When the artist adds lyrics in Studio, they rise with the music
                here — RECT’s stage, not a caption.
              </p>
            </div>
          )}
        </div>
      </div>

      <footer className="immersion-controls">
        <div className="immersion-seek">
          <span>{formatClock(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="immersion-range"
            aria-label="Seek"
            style={{
              background: `linear-gradient(to right, var(--rect) ${pct}%, rgba(255,255,255,0.15) ${pct}%)`,
            }}
          />
          <span>{formatClock(duration)}</span>
        </div>
        <div className="immersion-transport">
          <button
            type="button"
            onClick={onPrev}
            disabled={!canPrev && currentTime <= 3}
            aria-label="Previous"
          >
            ⏮
          </button>
          <button
            type="button"
            className="immersion-play"
            onClick={onToggle}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!canNext}
            aria-label="Next"
          >
            ⏭
          </button>
        </div>
        <div className="immersion-actions">
          <PlayerLikeButton trackId={track.id} />
          <AddToPlaylist
            trackId={track.id}
            compact
            dropUp
            loginNext={`/songs/${track.id}`}
          />
          <AddToFanChart trackId={track.id} compact />
          {track.artist_id && !privateArtist ? (
            <>
              <PlayerFollowButton
                artistId={track.artist_id}
                loginNext={`/songs/${track.id}`}
              />
              <ArtistTipButton
                artistId={track.artist_id}
                compact
                dropUp
                loginNext={`/songs/${track.id}`}
                trackId={track.id}
                trackTitle={trackTitle(track)}
              />
            </>
          ) : null}
          <ShareTrackButton track={track} compact dropUp />
        </div>
      </footer>
    </div>
  );
}
