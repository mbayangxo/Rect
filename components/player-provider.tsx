"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AddToPlaylist } from "@/components/add-to-playlist";
import { ArtistTipButton } from "@/components/artist-tip-button";
import { PlayerFollowButton } from "@/components/player-follow-button";
import { PlayerLikeButton } from "@/components/player-like-button";
import { ShareTrackButton } from "@/components/share-track-button";
import { TrackCover } from "@/components/track-cover";
import { PRIVATE_ARTIST_LABEL } from "@/lib/dashboard/privacy";
import { publishCreditsRemaining } from "@/lib/credits-live";
import { createClient } from "@/lib/supabase/client";
import { trackArtist, trackTitle, type TrackRow } from "@/lib/tracks";

const PLAYER_PREFS_KEY = "rect-player-prefs";
/** Guests get a short sample; full streams require sign-in (credits). */
const GUEST_PREVIEW_SECS = 30;

type PlayerPrefs = {
  volume: number;
  muted: boolean;
  repeat: boolean;
};

function readPlayerPrefs(): PlayerPrefs {
  try {
    const raw = localStorage.getItem(PLAYER_PREFS_KEY);
    if (!raw) return { volume: 1, muted: false, repeat: false };
    const parsed = JSON.parse(raw) as Partial<PlayerPrefs>;
    const volume =
      typeof parsed.volume === "number" && Number.isFinite(parsed.volume)
        ? Math.max(0, Math.min(1, parsed.volume))
        : 1;
    return {
      volume,
      muted: Boolean(parsed.muted),
      repeat: Boolean(parsed.repeat),
    };
  } catch {
    return { volume: 1, muted: false, repeat: false };
  }
}

function writePlayerPrefs(prefs: PlayerPrefs) {
  try {
    localStorage.setItem(PLAYER_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota / private mode */
  }
}

export type PlayQueueOptions = {
  shuffle?: boolean;
  /** Loop the queue when it ends (default false). */
  repeat?: boolean;
};

type PlayerState = {
  track: TrackRow | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  canPrev: boolean;
  canNext: boolean;
  repeat: boolean;
  queue: TrackRow[];
  queueIndex: number;
  play: (track: TrackRow) => void;
  playQueue: (
    tracks: TrackRow[],
    startIndex?: number,
    options?: PlayQueueOptions,
  ) => void;
  playAt: (index: number) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  /** Append a track to the end of Up Next (starts playback if idle). */
  addToQueue: (track: TrackRow) => void;
  /** Insert a track to play right after the current one. */
  playNext: (track: TrackRow) => void;
  toggle: () => void;
  toggleRepeat: () => void;
  next: () => void;
  prev: () => void;
  seek: (t: number) => void;
};

const PlayerContext = createContext<PlayerState | null>(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}

function shuffleTracks(tracks: TrackRow[]): TrackRow[] {
  const out = [...tracks];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function formatClock(secs: number) {
  if (!Number.isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<TrackRow | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [creditNotice, setCreditNotice] = useState<string | null>(null);
  const [loginNext, setLoginNext] = useState("/dashboard");
  const nextRef = useRef<() => void>(() => undefined);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);
  const [queue, setQueue] = useState<TrackRow[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [queueOpen, setQueueOpen] = useState(false);
  const [savingQueue, setSavingQueue] = useState(false);
  const recordedFor = useRef<string | null>(null);
  const guestPreviewRef = useRef(false);
  const startGenRef = useRef(0);
  const trackRef = useRef<TrackRow | null>(null);
  const durationPersistedFor = useRef<string | null>(null);
  const queueRef = useRef<TrackRow[]>([]);
  const queueIndexRef = useRef(0);
  const repeatRef = useRef(false);
  const volumeBeforeMute = useRef(1);

  useEffect(() => {
    const prefs = readPlayerPrefs();
    setVolume(prefs.volume);
    setMuted(prefs.muted);
    setRepeat(prefs.repeat);
    repeatRef.current = prefs.repeat;
    if (prefs.volume > 0) volumeBeforeMute.current = prefs.volume;
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    writePlayerPrefs({ volume, muted, repeat });
  }, [volume, muted, repeat, prefsReady]);

  const syncQueueFlags = useCallback(() => {
    const q = queueRef.current;
    const i = queueIndexRef.current;
    const looping = repeatRef.current;
    setCanPrev(q.length > 1 && (i > 0 || looping));
    setCanNext(q.length > 1 && (i < q.length - 1 || looping));
  }, []);

  const commitQueue = useCallback(
    (tracks: TrackRow[], index: number) => {
      const safeIndex =
        tracks.length === 0
          ? 0
          : Math.max(0, Math.min(index, tracks.length - 1));
      queueRef.current = tracks;
      queueIndexRef.current = safeIndex;
      setQueue(tracks);
      setQueueIndex(safeIndex);
      syncQueueFlags();
    },
    [syncQueueFlags],
  );

  useEffect(() => {
    repeatRef.current = repeat;
    syncQueueFlags();
  }, [repeat, syncQueueFlags]);

  useEffect(() => {
    trackRef.current = track;
  }, [track]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.volume = 1;
    audioRef.current = audio;

    const onTime = () => {
      const t = audio.currentTime || 0;
      if (guestPreviewRef.current && t >= GUEST_PREVIEW_SECS) {
        audio.pause();
        audio.currentTime = GUEST_PREVIEW_SECS;
        setCurrentTime(GUEST_PREVIEW_SECS);
        setPlaying(false);
        setCreditNotice("Preview ended — sign in to keep listening.");
        return;
      }
      setCurrentTime(t);
    };
    const onMeta = () => {
      const secs = audio.duration || 0;
      setDuration(secs);
      const current = trackRef.current;
      if (!current?.id || !Number.isFinite(secs) || secs < 1) return;
      const existing = Number(current.duration_secs);
      if (Number.isFinite(existing) && existing > 0) return;
      if (durationPersistedFor.current === current.id) return;
      durationPersistedFor.current = current.id;
      const rounded = Math.round(secs);
      void fetch(`/api/tracks/${current.id}/duration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration_secs: rounded }),
      })
        .then(async (res) => {
          if (!res.ok) return;
          setTrack((t) =>
            t && t.id === current.id ? { ...t, duration_secs: rounded } : t,
          );
        })
        .catch(() => {
          /* best-effort catalog fill */
        });
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => {
      setPlaying(false);
      setCreditNotice(
        "Couldn't load this track. Check the audio file or try another song.",
      );
      const q = queueRef.current;
      if (q.length > 1) {
        window.setTimeout(() => nextRef.current(), 500);
      }
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
  }, [volume, muted]);

  const recordPlay = useCallback(
    async (trackId: string) => {
      if (recordedFor.current === trackId) return;
      recordedFor.current = trackId;
      try {
        const res = await fetch("/api/plays", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ track_id: trackId }),
        });
        if (res.status === 402) {
          recordedFor.current = null;
          commitQueue([], 0);
          setQueueOpen(false);
          publishCreditsRemaining(0);
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          setCreditNotice(
            data?.error ||
              "No play credits left. Buy a play pack on Home to keep listening.",
          );
          const audio = audioRef.current;
          if (audio) {
            audio.pause();
            setPlaying(false);
          }
          return;
        }

        if (res.ok) {
          const data = (await res.json().catch(() => null)) as {
            credits_remaining?: number | null;
          } | null;
          if (
            typeof data?.credits_remaining === "number" &&
            Number.isFinite(data.credits_remaining)
          ) {
            publishCreditsRemaining(data.credits_remaining);
          }
        } else {
          recordedFor.current = null;
          const data = (await res.json().catch(() => null)) as {
            error?: string;
            code?: string;
          } | null;
          if (res.status === 401) {
            guestPreviewRef.current = true;
            const current = trackRef.current;
            if (current?.id) {
              setLoginNext(`/songs/${current.id}`);
            }
            setCreditNotice(
              "Preview only — sign in to keep listening and climb the charts.",
            );
            const audio = audioRef.current;
            if (audio && audio.currentTime >= GUEST_PREVIEW_SECS) {
              audio.pause();
              audio.currentTime = GUEST_PREVIEW_SECS;
              setCurrentTime(GUEST_PREVIEW_SECS);
              setPlaying(false);
              setCreditNotice("Preview ended — sign in to keep listening.");
            }
          } else if (res.status === 402) {
            // handled above
          } else {
            setCreditNotice(
              data?.error ||
                "Couldn't save this play. Check your connection and try again.",
            );
          }
        }
      } catch {
        recordedFor.current = null;
        setCreditNotice("Couldn't save this play. Network error.");
      }
    },
    [commitQueue],
  );

  const startTrack = useCallback(
    (next: TrackRow) => {
      const audio = audioRef.current;
      const src = next.audio_url;
      if (!audio || !src) return;

      const gen = ++startGenRef.current;
      audio.pause();
      setPlaying(false);
      setTrack(next);
      recordedFor.current = null;
      durationPersistedFor.current = null;
      guestPreviewRef.current = false;
      setLoginNext(`/songs/${next.id}`);
      setCreditNotice(null);
      syncQueueFlags();

      void (async () => {
        let isGuest = true;
        try {
          const supabase = createClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          isGuest = !user;
        } catch {
          isGuest = true;
        }

        if (gen !== startGenRef.current) return;

        guestPreviewRef.current = isGuest;
        if (isGuest) {
          setCreditNotice(
            "30-second preview — sign in to keep listening and save plays.",
          );
        }

        audio.src = src;
        try {
          await audio.play();
          if (!isGuest) {
            void recordPlay(next.id);
          }
        } catch {
          setPlaying(false);
          setCreditNotice(
            "Couldn't play this track. The file may be missing or unsupported.",
          );
          if (queueRef.current.length > 1) {
            window.setTimeout(() => nextRef.current(), 500);
          }
        }
      })();
    },
    [recordPlay, syncQueueFlags],
  );

  const play = useCallback(
    (next: TrackRow) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (!next.audio_url) return;

      commitQueue([], 0);
      setQueueOpen(false);

      if (track?.id === next.id) {
        if (
          guestPreviewRef.current &&
          audio.currentTime >= GUEST_PREVIEW_SECS - 0.05
        ) {
          setLoginNext(`/songs/${next.id}`);
          setCreditNotice("Preview ended — sign in to keep listening.");
          return;
        }
        void audio.play().catch(() => setPlaying(false));
        return;
      }

      startTrack(next);
    },
    [track?.id, startTrack, commitQueue],
  );

  const playQueue = useCallback(
    (
      tracks: TrackRow[],
      startIndex = 0,
      options?: PlayQueueOptions,
    ) => {
      const playable = tracks.filter((t) => Boolean(t.audio_url));
      if (playable.length === 0) return;

      const ordered = options?.shuffle ? shuffleTracks(playable) : playable;
      const idx = options?.shuffle
        ? 0
        : Math.max(0, Math.min(startIndex, ordered.length - 1));

      // Only change repeat when caller sets it (e.g. Shuffle); keep user prefs otherwise
      if (options && "repeat" in options) {
        const nextRepeat = Boolean(options.repeat);
        setRepeat(nextRepeat);
        repeatRef.current = nextRepeat;
      }

      commitQueue(ordered, idx);
      if (ordered.length > 1) setQueueOpen(true);
      startTrack(ordered[idx]);
    },
    [startTrack, commitQueue],
  );

  const playAt = useCallback(
    (index: number) => {
      const q = queueRef.current;
      if (index < 0 || index >= q.length) return;
      queueIndexRef.current = index;
      setQueueIndex(index);
      startTrack(q[index]);
    },
    [startTrack],
  );

  const addToQueue = useCallback(
    (next: TrackRow) => {
      if (!next.audio_url) return;
      const q = queueRef.current;
      const i = queueIndexRef.current;
      const current = track;

      if (!current) {
        commitQueue([next], 0);
        setQueueOpen(true);
        startTrack(next);
        return;
      }

      if (q.length === 0) {
        commitQueue([current, next], 0);
        setQueueOpen(true);
        return;
      }

      commitQueue([...q, next], i);
      setQueueOpen(true);
    },
    [track, commitQueue, startTrack],
  );

  const playNext = useCallback(
    (next: TrackRow) => {
      if (!next.audio_url) return;
      const q = queueRef.current;
      const i = queueIndexRef.current;
      const current = track;

      if (!current) {
        commitQueue([next], 0);
        setQueueOpen(true);
        startTrack(next);
        return;
      }

      if (q.length === 0) {
        commitQueue([current, next], 0);
        setQueueOpen(true);
        return;
      }

      const copy = [...q];
      copy.splice(i + 1, 0, next);
      commitQueue(copy, i);
      setQueueOpen(true);
    },
    [track, commitQueue, startTrack],
  );

  const removeFromQueue = useCallback(
    (index: number) => {
      const q = queueRef.current;
      if (index < 0 || index >= q.length) return;
      const current = queueIndexRef.current;
      const nextQ = q.filter((_, i) => i !== index);

      if (nextQ.length === 0) {
        commitQueue([], 0);
        setQueueOpen(false);
        return;
      }

      if (index < current) {
        commitQueue(nextQ, current - 1);
        return;
      }

      if (index === current) {
        const newIndex = Math.min(index, nextQ.length - 1);
        commitQueue(nextQ, newIndex);
        startTrack(nextQ[newIndex]);
        return;
      }

      commitQueue(nextQ, current);
    },
    [commitQueue, startTrack],
  );

  const clearQueue = useCallback(() => {
    const q = queueRef.current;
    const i = queueIndexRef.current;
    const current = q[i];
    if (current) {
      commitQueue([current], 0);
    } else {
      commitQueue([], 0);
    }
    setQueueOpen(false);
  }, [commitQueue]);

  const saveQueueAsPlaylist = useCallback(async () => {
    const q = queueRef.current;
    if (savingQueue || q.length === 0) return;
    setSavingQueue(true);
    setCreditNotice(null);
    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Up next",
          track_ids: q.map((t) => t.id),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        playlist?: { id: string };
        authenticated?: boolean;
      };
      if (res.status === 401) {
        router.push("/auth/login?next=/playlists");
        return;
      }
      if (!res.ok || data.error || !data.playlist?.id) {
        setCreditNotice(data.error || "Could not save queue as playlist");
        return;
      }
      setQueueOpen(false);
      router.push(`/playlists/${data.playlist.id}`);
      router.refresh();
    } catch (e) {
      setCreditNotice(
        e instanceof Error ? e.message : "Could not save queue as playlist",
      );
    } finally {
      setSavingQueue(false);
    }
  }, [savingQueue, router]);

  const next = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) return;
    const nextIdx = queueIndexRef.current + 1;
    if (nextIdx < q.length) {
      queueIndexRef.current = nextIdx;
      setQueueIndex(nextIdx);
      startTrack(q[nextIdx]);
      return;
    }
    if (repeatRef.current && q.length > 0) {
      queueIndexRef.current = 0;
      setQueueIndex(0);
      startTrack(q[0]);
    }
  }, [startTrack]);

  nextRef.current = next;

  const prev = useCallback(() => {
    const audio = audioRef.current;
    const q = queueRef.current;
    const i = queueIndexRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    if (q.length === 0) {
      if (audio) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }
      return;
    }
    if (i > 0) {
      queueIndexRef.current = i - 1;
      setQueueIndex(i - 1);
      startTrack(q[i - 1]);
      return;
    }
    if (repeatRef.current) {
      queueIndexRef.current = q.length - 1;
      setQueueIndex(q.length - 1);
      startTrack(q[q.length - 1]);
      return;
    }
    if (audio) {
      audio.currentTime = 0;
      setCurrentTime(0);
    }
  }, [startTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onEnded = () => {
      const q = queueRef.current;
      const nextIdx = queueIndexRef.current + 1;
      if (q.length > 0 && nextIdx < q.length) {
        queueIndexRef.current = nextIdx;
        setQueueIndex(nextIdx);
        startTrack(q[nextIdx]);
        return;
      }
      if (repeatRef.current && q.length > 0) {
        queueIndexRef.current = 0;
        setQueueIndex(0);
        startTrack(q[0]);
        return;
      }
      setPlaying(false);
      syncQueueFlags();
    };

    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [startTrack, syncQueueFlags]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !track?.audio_url) return;
    if (audio.paused) {
      if (
        guestPreviewRef.current &&
        audio.currentTime >= GUEST_PREVIEW_SECS - 0.05
      ) {
        setLoginNext(`/songs/${track.id}`);
        setCreditNotice("Preview ended — sign in to keep listening.");
        return;
      }
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, [track]);

  const toggleRepeat = useCallback(() => {
    setRepeat((v) => {
      const next = !v;
      repeatRef.current = next;
      return next;
    });
  }, []);

  const seek = useCallback((t: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    let next = t;
    if (guestPreviewRef.current && next > GUEST_PREVIEW_SECS) {
      next = GUEST_PREVIEW_SECS;
      setCreditNotice("Preview only — sign in for the full track.");
    }
    audio.currentTime = next;
    setCurrentTime(next);
  }, []);

  const setVolumeLevel = useCallback((v: number) => {
    const next = Math.max(0, Math.min(1, v));
    setVolume(next);
    if (next > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((wasMuted) => {
      if (wasMuted) {
        if (volumeBeforeMute.current <= 0) volumeBeforeMute.current = 0.7;
        setVolume(volumeBeforeMute.current);
        return false;
      }
      volumeBeforeMute.current = volume > 0 ? volume : 0.7;
      return true;
    });
  }, [volume]);

  return (
    <PlayerContext.Provider
      value={{
        track,
        playing,
        currentTime,
        duration,
        canPrev,
        canNext,
        repeat,
        queue,
        queueIndex,
        play,
        playQueue,
        playAt,
        removeFromQueue,
        clearQueue,
        addToQueue,
        playNext,
        toggle,
        toggleRepeat,
        next,
        prev,
        seek,
      }}
    >
      {children}
      {creditNotice ? (
        <div className="fixed inset-x-0 bottom-[4.5rem] z-50 mx-auto w-full max-w-6xl px-4 sm:px-8 lg:px-10">
          <div className="rounded-xl border border-[#F5A623]/40 bg-[#120e06]/95 px-4 py-3 text-sm text-[#F5A623] backdrop-blur-md">
            {creditNotice}{" "}
            {/credit|pack/i.test(creditNotice) ? (
              <a href="/dashboard" className="font-semibold underline">
                Get a pack
              </a>
            ) : null}
            {/sign in/i.test(creditNotice) ? (
              <a
                href={`/auth/login?next=${encodeURIComponent(loginNext)}`}
                className="font-semibold underline"
              >
                Sign in
              </a>
            ) : null}
            <button
              type="button"
              className="ml-3 text-xs text-white/50 hover:text-white"
              onClick={() => setCreditNotice(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      {track && queueOpen && queue.length > 0 ? (
        <div className="fixed inset-x-0 bottom-[4.75rem] z-50 mx-auto w-full max-w-6xl px-4 sm:bottom-[5.25rem] sm:px-8 lg:px-10">
          <div className="max-h-[40vh] overflow-hidden rounded-2xl border border-white/10 bg-[#071208]/97 shadow-2xl shadow-black/40 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1DB954]">
                Up next · {queue.length}
              </p>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={savingQueue}
                  onClick={() => void saveQueueAsPlaylist()}
                  className="text-xs font-medium text-[#1DB954] hover:text-[#17a349] disabled:opacity-50"
                >
                  {savingQueue ? "Saving…" : "Save as playlist"}
                </button>
                {queue.length > 1 ? (
                  <button
                    type="button"
                    onClick={clearQueue}
                    className="text-xs text-white/45 hover:text-white"
                  >
                    Clear upcoming
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setQueueOpen(false)}
                  className="text-xs text-white/45 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>
            <ul className="max-h-[min(40vh,20rem)] overflow-y-auto py-1">
              {queue.map((t, i) => {
                const active = i === queueIndex;
                return (
                  <li
                    key={`${t.id}-${i}`}
                    className={`flex items-center gap-2 px-3 py-2 ${
                      active ? "bg-[#1DB954]/12" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="w-5 shrink-0 text-center text-[0.65rem] tabular-nums text-white/35">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => playAt(i)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <TrackCover track={t} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-sm ${
                            active ? "font-semibold text-[#1DB954]" : "text-white"
                          }`}
                        >
                          {trackTitle(t)}
                        </span>
                        <span className="block truncate text-xs text-white/40">
                          {trackArtist(t)}
                        </span>
                      </span>
                    </button>
                    {queue.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeFromQueue(i)}
                        className="shrink-0 px-2 text-xs text-white/35 hover:text-red-300"
                        aria-label={`Remove ${trackTitle(t)} from queue`}
                        title="Remove"
                      >
                        ✕
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
      {track ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#071208]/95 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-8 lg:px-10">
            <Link href={`/songs/${track.id}`} className="shrink-0">
              <TrackCover track={track} size="sm" />
            </Link>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={prev}
                disabled={!canPrev && currentTime <= 3}
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"
                aria-label="Previous"
              >
                ⏮
              </button>
              <button
                type="button"
                onClick={toggle}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1DB954] text-sm font-bold text-black hover:bg-[#17a349]"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? "❚❚" : "▶"}
              </button>
              <button
                type="button"
                onClick={next}
                disabled={!canNext}
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"
                aria-label="Next"
              >
                ⏭
              </button>
              <button
                type="button"
                onClick={toggleRepeat}
                className={`flex h-9 w-9 items-center justify-center rounded-full text-[0.65rem] font-semibold tracking-wide ${
                  repeat
                    ? "bg-[#1DB954]/20 text-[#1DB954]"
                    : "text-white/45 hover:bg-white/10 hover:text-white"
                }`}
                aria-label={repeat ? "Repeat on" : "Repeat off"}
                title={repeat ? "Repeat queue on" : "Repeat queue off"}
              >
                ↺
              </button>
              {queue.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setQueueOpen((o) => !o)}
                  className={`relative flex h-9 w-9 items-center justify-center rounded-full text-[0.65rem] font-semibold ${
                    queueOpen
                      ? "bg-[#1DB954]/20 text-[#1DB954]"
                      : "text-white/45 hover:bg-white/10 hover:text-white"
                  }`}
                  aria-label={queueOpen ? "Hide queue" : "Show queue"}
                  title="Up next"
                >
                  ≡
                  {queue.length > 1 ? (
                    <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#1DB954] px-0.5 text-[0.55rem] font-bold text-black">
                      {queue.length > 99 ? "99+" : queue.length}
                    </span>
                  ) : null}
                </button>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <Link
                href={`/songs/${track.id}`}
                className="block truncate text-sm font-medium text-white hover:text-[#1DB954]"
              >
                {trackTitle(track)}
              </Link>
              {track.artist_id &&
              trackArtist(track) !== PRIVATE_ARTIST_LABEL ? (
                <Link
                  href={`/artists/${track.artist_id}`}
                  className="block truncate text-xs text-white/45 hover:text-[#1DB954]"
                >
                  {trackArtist(track)}
                </Link>
              ) : (
                <p className="truncate text-xs text-white/45">
                  {trackArtist(track)}
                </p>
              )}
              <div className="mt-1 flex items-center gap-2">
                <span className="w-8 shrink-0 text-[0.65rem] tabular-nums text-white/35">
                  {formatClock(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => seek(Number(e.target.value))}
                  className="min-w-0 flex-1 accent-[#1DB954]"
                  aria-label="Seek"
                />
                <span className="w-8 shrink-0 text-right text-[0.65rem] tabular-nums text-white/35">
                  {formatClock(duration)}
                </span>
              </div>
            </div>
            <div className="hidden items-center gap-1 sm:flex">
              <button
                type="button"
                onClick={toggleMute}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[0.55rem] font-semibold uppercase tracking-wide text-white/55 hover:bg-white/10 hover:text-white"
                aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
                title={muted || volume === 0 ? "Unmute" : "Mute"}
              >
                {muted || volume === 0 ? "Off" : "Vol"}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => setVolumeLevel(Number(e.target.value))}
                className="w-16 accent-[#1DB954] lg:w-20"
                aria-label="Volume"
              />
            </div>
            <button
              type="button"
              onClick={toggleMute}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[0.55rem] font-semibold uppercase tracking-wide text-white/55 hover:bg-white/10 hover:text-white sm:hidden"
              aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
            >
              {muted || volume === 0 ? "Off" : "Vol"}
            </button>
            {track.artist_id &&
            trackArtist(track) !== PRIVATE_ARTIST_LABEL ? (
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
            <PlayerLikeButton trackId={track.id} />
            <AddToPlaylist
              trackId={track.id}
              compact
              dropUp
              loginNext={`/songs/${track.id}`}
            />
            <ShareTrackButton track={track} compact dropUp />
          </div>
        </div>
      ) : null}
    </PlayerContext.Provider>
  );
}
