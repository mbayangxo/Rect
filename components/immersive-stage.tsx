"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AddToPlaylist } from "@/components/add-to-playlist";
import { ArtistTipButton } from "@/components/artist-tip-button";
import { PlayerFollowButton } from "@/components/player-follow-button";
import { PlayerLikeButton } from "@/components/player-like-button";
import { ShareTrackButton } from "@/components/share-track-button";
import { TrackCover } from "@/components/track-cover";
import { PRIVATE_ARTIST_LABEL } from "@/lib/dashboard/privacy";
import {
  activeLyricIndex,
  type LyricLine,
  type LyricsPayload,
} from "@/lib/immerse/lyrics";
import { trackArtist, trackTitle, type TrackRow } from "@/lib/tracks";

type ImmerseDoor = {
  id: string;
  label: string;
  href: string;
  kind: "portal" | "live";
  hint?: string;
};

type ImmersePayload = {
  writers: { name: string; percent: number }[];
  lyrics: LyricsPayload;
  social: {
    like_count: number;
    liked: boolean;
    play_count: number;
    tips_ready: boolean;
    can_tip: boolean;
  };
  chart: {
    position: number | null;
    board: string | null;
    rect_score: number | null;
    href: string | null;
  };
  fans: { id: string; display_name: string | null }[];
  doors: ImmerseDoor[];
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
  const [data, setData] = useState<ImmersePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const activeLineRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setData(null);
    void (async () => {
      try {
        const res = await fetch(`/api/tracks/${track.id}/immerse`);
        const json = (await res.json()) as ImmersePayload & { error?: string };
        if (cancelled) return;
        if (!res.ok || json.error) {
          setLoadError(json.error || "Could not load immersive stage.");
          return;
        }
        setData(json);
      } catch {
        if (!cancelled) setLoadError("Network error loading immersion.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [track.id]);

  const lines: LyricLine[] = data?.lyrics.lines ?? [];
  const activeIdx = useMemo(
    () => activeLyricIndex(lines, currentTime),
    [lines, currentTime],
  );

  useEffect(() => {
    activeLineRef.current?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [activeIdx, track.id]);

  const title = trackTitle(track);
  const artist = trackArtist(track);
  const artistPublic =
    Boolean(track.artist_id) && artist !== PRIVATE_ARTIST_LABEL;
  const cover = track.cover_art_url;
  const pct =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      className="immersive-stage"
      role="dialog"
      aria-modal="true"
      aria-label={`Now playing ${title}`}
    >
      <div
        className="immersive-stage__bg"
        style={
          cover
            ? {
                backgroundImage: `url(${cover})`,
              }
            : undefined
        }
        aria-hidden
      />
      <div className="immersive-stage__veil" aria-hidden />

      <header className="immersive-stage__top">
        <p className="immersive-stage__brand">RECT Sound</p>
        <button
          type="button"
          className="immersive-stage__close"
          onClick={onClose}
          aria-label="Close immersive player"
        >
          Minimize
        </button>
      </header>

      <div className="immersive-stage__grid">
        <section className="immersive-stage__hero" aria-label="Now playing">
          <div
            className={`immersive-stage__art ${playing ? "is-playing" : ""}`}
          >
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" className="immersive-stage__cover" />
            ) : (
              <div className="immersive-stage__cover immersive-stage__cover--fallback">
                <TrackCover track={track} size="lg" />
              </div>
            )}
            <div
              className={`immersive-stage__pulse ${playing ? "is-on" : ""}`}
              aria-hidden
            />
          </div>

          <div className="immersive-stage__identity">
            <h1 className="immersive-stage__title">{title}</h1>
            {track.artist_id && artistPublic ? (
              <Link
                href={`/artists/${track.artist_id}`}
                className="immersive-stage__artist"
              >
                {artist}
              </Link>
            ) : (
              <p className="immersive-stage__artist">{artist}</p>
            )}
            <p className="immersive-stage__meta">
              {[track.genre, track.language].filter(Boolean).join(" · ") ||
                "Live listen"}
              {data?.social
                ? ` · ${data.social.play_count} plays · ${data.social.like_count} likes`
                : ""}
            </p>
          </div>

          <div className="immersive-stage__transport">
            <button
              type="button"
              onClick={onPrev}
              disabled={!canPrev && currentTime <= 3}
              className="immersive-stage__ctrl"
              aria-label="Previous"
            >
              ⏮
            </button>
            <button
              type="button"
              onClick={onToggle}
              className="immersive-stage__play"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canNext}
              className="immersive-stage__ctrl"
              aria-label="Next"
            >
              ⏭
            </button>
          </div>

          <div className="immersive-stage__seek">
            <span>{formatClock(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={(e) => onSeek(Number(e.target.value))}
              aria-label="Seek"
              style={{ ["--immersive-pct" as string]: `${pct}%` }}
            />
            <span>{formatClock(duration)}</span>
          </div>

          <div className="immersive-stage__actions">
            <PlayerLikeButton trackId={track.id} />
            {track.artist_id && artistPublic ? (
              <>
                <PlayerFollowButton
                  artistId={track.artist_id}
                  loginNext={`/songs/${track.id}`}
                />
                <ArtistTipButton
                  artistId={track.artist_id}
                  tipsReady={data?.social.tips_ready ?? true}
                  compact
                  dropUp
                  loginNext={`/songs/${track.id}`}
                  trackId={track.id}
                  trackTitle={title}
                />
              </>
            ) : null}
            <AddToPlaylist
              trackId={track.id}
              compact
              dropUp
              loginNext={`/songs/${track.id}`}
            />
            <ShareTrackButton track={track} compact dropUp />
          </div>
        </section>

        <section className="immersive-stage__lyrics" aria-label="Lyrics">
          <h2 className="immersive-stage__section-label">Lyrics</h2>
          {loading ? (
            <p className="immersive-stage__muted">Loading lyrics…</p>
          ) : loadError ? (
            <p className="immersive-stage__muted">{loadError}</p>
          ) : lines.length === 0 ? (
            <div className="immersive-stage__lyrics-empty">
              <p className="immersive-stage__karaoke-idle">{title}</p>
              <p className="immersive-stage__muted">
                Karaoke lines appear when this track has lyrics.
              </p>
            </div>
          ) : (
            <ul className="immersive-stage__lyric-list">
              {lines.map((line, i) => {
                const state =
                  i === activeIdx
                    ? "is-active"
                    : i < activeIdx
                      ? "is-passed"
                      : "is-ahead";
                return (
                  <li
                    key={`${line.t}-${i}`}
                    ref={i === activeIdx ? activeLineRef : null}
                    className={`immersive-stage__lyric ${state}`}
                  >
                    {line.text}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="immersive-stage__side" aria-label="Listen extras">
          <div className="immersive-stage__panel">
            <h2 className="immersive-stage__section-label">Doors</h2>
            <div className="immersive-stage__doors">
              {(data?.doors ?? []).map((door) => (
                <Link
                  key={door.id}
                  href={door.href}
                  className={`immersive-stage__door immersive-stage__door--${door.kind}`}
                  onClick={onClose}
                >
                  <span className="immersive-stage__door-label">
                    {door.label}
                  </span>
                  {door.hint ? (
                    <span className="immersive-stage__door-hint">
                      {door.hint}
                    </span>
                  ) : null}
                </Link>
              ))}
              {!loading && (data?.doors?.length ?? 0) === 0 ? (
                <p className="immersive-stage__muted">No doors yet.</p>
              ) : null}
            </div>
          </div>

          <div className="immersive-stage__panel">
            <h2 className="immersive-stage__section-label">Writers</h2>
            {loading ? (
              <p className="immersive-stage__muted">…</p>
            ) : (data?.writers.length ?? 0) > 0 ? (
              <ul className="immersive-stage__writers">
                {data!.writers.map((w) => (
                  <li key={`${w.name}-${w.percent}`}>
                    <span>{w.name}</span>
                    <span>{w.percent}%</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="immersive-stage__muted">
                Writer splits appear when the artist adds them.
              </p>
            )}
          </div>

          <div className="immersive-stage__panel">
            <h2 className="immersive-stage__section-label">Fan chart</h2>
            {data?.chart.position != null ? (
              <Link
                href={data.chart.href || "/charts"}
                className="immersive-stage__chart-hit"
                onClick={onClose}
              >
                <span className="immersive-stage__chart-pos">
                  #{data.chart.position}
                </span>
                <span>
                  {data.chart.board || "STANDINGS"}
                  {data.chart.rect_score != null
                    ? ` · score ${data.chart.rect_score}`
                    : ""}
                </span>
              </Link>
            ) : (
              <p className="immersive-stage__muted">
                Not on this week&apos;s board yet — keep listening.
              </p>
            )}
            {(data?.fans.length ?? 0) > 0 ? (
              <ul className="immersive-stage__fans">
                {data!.fans.map((f) => (
                  <li key={f.id}>
                    <Link href={`/people/${f.id}`} onClick={onClose}>
                      {f.display_name?.trim() || "Listener"}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="immersive-stage__muted immersive-stage__fans-empty">
                Friends who like this track show up here.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
