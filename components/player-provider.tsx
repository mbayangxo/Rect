"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { trackArtist, trackTitle, type TrackRow } from "@/lib/tracks";

type PlayerState = {
  track: TrackRow | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  play: (track: TrackRow) => void;
  toggle: () => void;
  seek: (t: number) => void;
};

const PlayerContext = createContext<PlayerState | null>(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<TrackRow | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const recordedFor = useRef<string | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;

    const onTime = () => setCurrentTime(audio.currentTime || 0);
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnded = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audioRef.current = null;
    };
  }, []);

  const recordPlay = useCallback(async (trackId: string) => {
    if (recordedFor.current === trackId) return;
    recordedFor.current = trackId;
    try {
      await fetch("/api/plays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_id: trackId }),
      });
    } catch {
      /* play logging is best-effort */
    }
  }, []);

  const play = useCallback(
    (next: TrackRow) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (!next.audio_url) return;

      if (track?.id === next.id) {
        void audio.play().catch(() => setPlaying(false));
        return;
      }

      setTrack(next);
      recordedFor.current = null;
      audio.src = next.audio_url;
      void audio.play().then(() => {
        void recordPlay(next.id);
      }).catch(() => setPlaying(false));
    },
    [track?.id, recordPlay],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !track?.audio_url) return;
    if (audio.paused) {
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, [track]);

  const seek = useCallback((t: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = t;
    setCurrentTime(t);
  }, []);

  return (
    <PlayerContext.Provider
      value={{ track, playing, currentTime, duration, play, toggle, seek }}
    >
      {children}
      {track ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#071208]/95 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-8 lg:px-10">
            <button
              type="button"
              onClick={toggle}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1DB954] text-sm font-bold text-black hover:bg-[#17a349]"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {trackTitle(track)}
              </p>
              <p className="truncate text-xs text-white/45">
                {trackArtist(track)}
              </p>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={(e) => seek(Number(e.target.value))}
                className="mt-1 w-full accent-[#1DB954]"
                aria-label="Seek"
              />
            </div>
          </div>
        </div>
      ) : null}
    </PlayerContext.Provider>
  );
}
