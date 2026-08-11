"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AddToPlaylist } from "@/components/add-to-playlist";
import { GenreFilterChips } from "@/components/genre-filter-chips";
import { LanguageFilterChips } from "@/components/language-filter-chips";
import { PlaceFilterChips } from "@/components/place-filter-chips";
import { usePlayer } from "@/components/player-provider";
import { RectLogo } from "@/components/rect-logo";
import { QueueTrackButton } from "@/components/queue-track-button";
import { ShareTrackButton } from "@/components/share-track-button";
import { TrackCover } from "@/components/track-cover";
import { TrackLikeButton } from "@/components/track-like-button";
import type { RadioStation } from "@/lib/dashboard/radio";
import { trackArtist, trackTitle, formatTrackDuration } from "@/lib/tracks";

const TONES = [
  "from-[#0F2B1A] to-[#060908]",
  "from-[#1A0F2B] to-[#080609]",
  "from-[#0F1A2B] to-[#06080A]",
  "from-[#2B1A0F] to-[#090806]",
  "from-[#2B0F1A] to-[#090608]",
] as const;

type Props = {
  stations: RadioStation[];
  loadError: string | null;
  personalized: boolean;
  languageSlug?: string | null;
  languageLabel?: string | null;
  languageChips?: { slug: string; name: string }[];
  genreSlug?: string | null;
  genreLabel?: string | null;
  genreChips?: { slug: string; name: string }[];
  placeSlug?: string | null;
  placeLabel?: string | null;
  placeChips?: { slug: string; name: string }[];
  likedTracks?: Record<string, boolean>;
  likesReady?: boolean;
};

export function RadioClient({
  stations,
  loadError,
  personalized,
  languageSlug = null,
  languageLabel = null,
  languageChips = [],
  genreSlug = null,
  genreLabel = null,
  genreChips = [],
  placeSlug = null,
  placeLabel = null,
  placeChips = [],
  likedTracks = {},
  likesReady = false,
}: Props) {
  const player = usePlayer();
  const [activeId, setActiveId] = useState<string | null>(
    stations[0]?.id ?? null,
  );

  const active = useMemo(
    () => stations.find((s) => s.id === activeId) ?? stations[0] ?? null,
    [stations, activeId],
  );

  function playStation(station: RadioStation, fromIndex = 0) {
    setActiveId(station.id);
    const playable = station.tracks.filter((t) => t.audio_url);
    if (playable.length === 0) return;
    const idx = Math.max(0, Math.min(fromIndex, playable.length - 1));
    // Map from station index to playable index when clicking a row
    const start =
      fromIndex === 0
        ? 0
        : Math.max(
            0,
            playable.findIndex((t) => t.id === station.tracks[fromIndex]?.id),
          );
    player.playQueue(
      playable,
      fromIndex === 0 ? 0 : start >= 0 ? start : idx,
      { repeat: true },
    );
  }

  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/dashboard">
            <RectLogo size={34} showWordmark />
          </Link>
          <nav className="flex gap-4 text-sm text-white/55">
            <Link href="/dashboard" className="hover:text-white">
              Home
            </Link>
            <Link href="/search" className="hover:text-white">
              Search
            </Link>
            <Link href="/radio" className="text-[#1DB954]">
              Radio
            </Link>
            <Link href="/charts" className="hover:text-white">
              Charts
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-8 px-5 py-10 sm:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            RECT Radio
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
            Stations from the world
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/45">
            {personalized
              ? "Stations tuned to your places, languages, listening times, and genres."
              : "Place and genre stations from published catalog tracks."}
          </p>
          <div className="mt-4 space-y-2">
            <PlaceFilterChips
              activeSlug={placeSlug}
              basePath="/radio"
              keepParams={{
                genre: genreSlug || undefined,
                language: languageSlug || undefined,
              }}
              places={placeChips}
            />
            <GenreFilterChips
              activeSlug={genreSlug}
              basePath="/radio"
              keepParams={{
                language: languageSlug || undefined,
                place: placeSlug || undefined,
              }}
              genres={genreChips}
            />
            <LanguageFilterChips
              activeSlug={languageSlug}
              basePath="/radio"
              keepParams={{
                genre: genreSlug || undefined,
                place: placeSlug || undefined,
              }}
              languages={languageChips}
            />
          </div>
          {placeLabel || genreLabel || languageLabel ? (
            <p className="mt-2 text-xs text-white/40">
              Dial filtered
              {placeLabel ? ` · ${placeLabel}` : ""}
              {genreLabel ? ` · ${genreLabel}` : ""}
              {languageLabel ? ` · ${languageLabel}` : ""}.
            </p>
          ) : null}
        </div>

        {loadError ? (
          <p className="rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-4 py-3 text-sm text-[#1DB954]">
            Could not load radio. {loadError}
          </p>
        ) : stations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
            <p className="text-base font-medium">
              {placeLabel || genreLabel || languageLabel
                ? `No stations for ${[placeLabel, genreLabel, languageLabel].filter(Boolean).join(" · ")}`
                : "No stations yet"}
            </p>
            <p className="mt-2 text-sm text-white/40">
              Publish tracks with genres to light up the dial.
            </p>
          </div>
        ) : (
          <>
            {active ? (
              <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0a2e18] to-[#060908] p-6 sm:p-8">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[#1DB954]">
                  {active.forYou ? "For you · On air" : "On air"}
                </p>
                <h2 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold sm:text-3xl">
                  {active.label}
                </h2>
                <p className="mt-1 text-sm text-white/45">{active.subtitle}</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => playStation(active)}
                    className="inline-flex items-center gap-2 rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-semibold text-black hover:bg-[#17a349]"
                  >
                    ▶ Play station
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(active.id);
                      const playable = active.tracks.filter((t) => t.audio_url);
                      player.playQueue(playable, 0, {
                        shuffle: true,
                        repeat: true,
                      });
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10"
                  >
                    ⇄ Shuffle
                  </button>
                </div>
              </section>
            ) : null}

            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
                Frequencies
              </h2>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                {stations.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => playStation(s)}
                    className={`w-[150px] shrink-0 overflow-hidden rounded-xl border text-left transition ${
                      active?.id === s.id
                        ? "border-[#1DB954]/50"
                        : "border-white/10 hover:border-white/25"
                    }`}
                  >
                    <div
                      className={`flex h-20 items-end bg-gradient-to-br ${TONES[i % TONES.length]} p-3`}
                    >
                      {s.forYou ? (
                        <span className="rounded bg-[#1DB954]/20 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide text-[#1DB954]">
                          For you
                        </span>
                      ) : null}
                    </div>
                    <div className="bg-white/[0.03] p-3">
                      <p className="truncate text-sm font-semibold">{s.label}</p>
                      <p className="mt-0.5 truncate text-[0.65rem] text-white/40">
                        {s.subtitle}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {active && active.tracks.length > 0 ? (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
                  Queue · {active.label}
                </h2>
                <ul className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                  {active.tracks.map((t, i) => {
                    const isPlaying = player.track?.id === t.id;
                    return (
                      <li
                        key={`${active.id}-${t.id}-${i}`}
                        className={`flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 last:border-0 ${
                          isPlaying ? "bg-[#1DB954]/10" : ""
                        }`}
                      >
                        <span className="w-6 text-center text-xs tabular-nums text-white/35">
                          {i + 1}
                        </span>
                        <TrackCover track={t} size="sm" />
                        <button
                          type="button"
                          onClick={() => playStation(active, i)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block truncate text-sm font-medium">
                            {trackTitle(t)}
                          </span>
                          <span className="block truncate text-xs text-white/40">
                            {trackArtist(t)}
                            {formatTrackDuration(t.duration_secs)
                              ? ` · ${formatTrackDuration(t.duration_secs)}`
                              : ""}
                          </span>
                        </button>
                        <AddToPlaylist
                          trackId={t.id}
                          compact
                          loginNext="/radio"
                        />
                        <TrackLikeButton
                          trackId={t.id}
                          initialLiked={Boolean(likedTracks[t.id])}
                          likesReady={likesReady}
                          loginNext="/radio"
                          compact
                        />
                        <QueueTrackButton track={t} compact />
                        <ShareTrackButton track={t} compact />
                        <span className="text-[#1DB954]">
                          {isPlaying && player.playing ? "❚❚" : "▶"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
