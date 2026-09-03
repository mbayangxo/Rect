"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type {
  LiveRoom,
  LiveRoomMode,
  LiveRoomVisibility,
} from "@/lib/dashboard/live-rooms";

type Props = {
  artistId: string;
  initialRoom: LiveRoom | null;
  missingTable: boolean;
  countries: string[];
  city: string;
};

const MODES: { id: LiveRoomMode; label: string; hint: string }[] = [
  {
    id: "video",
    label: "Video",
    hint: "Host camera preview — fan video arrives with RECT Live (pro)",
  },
  {
    id: "photos",
    label: "Photos",
    hint: "Push photos to the room — fans see them live (recommended)",
  },
  {
    id: "audio",
    label: "Audio",
    hint: "Host mic preview — fan audio arrives with RECT Live (pro)",
  },
];

export function StudioLiveRoomManager({
  artistId,
  initialRoom,
  missingTable,
  countries,
  city,
}: Props) {
  const router = useRouter();
  const [room, setRoom] = useState(initialRoom);
  const [mode, setMode] = useState<LiveRoomMode>("photos");
  const [visibility, setVisibility] =
    useState<LiveRoomVisibility>("public");
  const alreadyLive = initialRoom?.status === "live";
  const [title, setTitle] = useState(
    alreadyLive && initialRoom ? initialRoom.title : "Live Room",
  );
  const [country, setCountry] = useState(countries[0] ?? "");
  const [cityName, setCityName] = useState(city || "");
  const [neighborhood, setNeighborhood] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setRoom(initialRoom);
  }, [initialRoom]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function startPreview(nextMode: LiveRoomMode) {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (!videoRef.current) return;
    if (nextMode === "photos") {
      videoRef.current.srcObject = null;
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: nextMode === "video",
        audio: true,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not access camera/mic — check browser permissions",
      );
    }
  }

  async function goLive() {
    if (pending || missingTable) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/live-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          mode,
          visibility,
          country: country || null,
          city: cityName || null,
          neighborhood: neighborhood || null,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        live_room_id?: string;
      };
      if (!res.ok || !data.live_room_id) {
        setError(data.error || "Could not go live");
        return;
      }
      if ((data as { skipped?: string }).skipped === "already_live") {
        setError("You’re already live — opening your room.");
      }
      await startPreview(mode);
      router.refresh();
      router.push(`/artists/${artistId}/live/${data.live_room_id}?host=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  async function endLive() {
    if (!room || room.status !== "live" || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/live-rooms", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ live_room_id: room.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not end Live Room");
        return;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setRoom((r) => (r ? { ...r, status: "ended" } : r));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  async function pushPhoto() {
    if (!room || room.status !== "live" || !photoUrl.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/live-rooms/${room.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "photo",
          photo_url: photoUrl.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not push photo");
        return;
      }
      setPhotoUrl("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  const isLive = room?.status === "live";

  return (
    <div className="space-y-8">
      {missingTable ? (
        <p className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-3 text-sm text-[#F5A623]">
          Run <code className="text-xs">20260830_live_rooms.sql</code> in
          Supabase SQL Editor, then refresh.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {isLive && room ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-red-300">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
                LIVE · {room.title}
              </p>
              <p className="mt-1 text-xs text-white/45">
                {room.mode} · {room.viewer_count} watching · {room.visibility}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/artists/${artistId}/live/${room.id}?host=1`}
                className="rounded-full bg-[#1DB954] px-4 py-2 text-xs font-semibold text-black"
              >
                Open room
              </Link>
              <button
                type="button"
                disabled={pending}
                onClick={() => void endLive()}
                className="rounded-full border border-white/20 px-4 py-2 text-xs text-white/80 hover:bg-white/10 disabled:opacity-50"
              >
                End Live
              </button>
            </div>
          </div>

          {room.mode === "photos" ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://… photo URL to push on stage"
                className="flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={pending || !photoUrl.trim()}
                onClick={() => void pushPhoto()}
                className="rounded-full bg-white/10 px-4 py-2 text-xs font-medium disabled:opacity-40"
              >
                Push photo
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!isLive ? (
        <div className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div>
            <label className="text-xs text-white/45">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <p className="text-xs text-white/45">Mode</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMode(m.id);
                    void startPreview(m.id);
                  }}
                  className={`rounded-xl border px-3 py-3 text-left text-sm transition ${
                    mode === m.id
                      ? "border-[#1DB954]/60 bg-[#1DB954]/10"
                      : "border-white/10 hover:border-white/25"
                  }`}
                >
                  <span className="font-medium">{m.label}</span>
                  <span className="mt-1 block text-[11px] text-white/40">
                    {m.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-white/45">Who can enter</label>
            <select
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as LiveRoomVisibility)
              }
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm"
            >
              <option value="public">Public — anyone on RECT</option>
              <option value="fan_club">Fan club members</option>
              <option value="private">Private — you only (test)</option>
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs text-white/45">Country</label>
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="SN"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-white/45">City</label>
              <input
                value={cityName}
                onChange={(e) => setCityName(e.target.value)}
                placeholder="Dakar"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-white/45">Neighborhood</label>
              <input
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                placeholder="Médina"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {(mode === "video" || mode === "audio") && (
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
              <video
                ref={videoRef}
                muted
                playsInline
                className={`w-full bg-black ${mode === "audio" ? "h-24 object-cover opacity-40" : "aspect-video object-cover"}`}
              />
              <p className="px-3 py-2 text-[11px] text-white/35">
                Preview only here — open the room after Go Live for the fan
                stage. Video uses your device camera (small rooms).
              </p>
            </div>
          )}

          <button
            type="button"
            disabled={pending || missingTable}
            onClick={() => void goLive()}
            className="rounded-full bg-red-500 px-6 py-3 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50"
          >
            {pending ? "Starting…" : "Go Live"}
          </button>
        </div>
      ) : null}

      <p className="text-xs text-white/35">
        Live Room = everyday presence in your Artist World. RECT Live (pro
        performances) ships in a later phase.
      </p>
    </div>
  );
}
