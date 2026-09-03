"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  LiveRoom,
  LiveRoomMessage,
  LiveRoomPhoto,
} from "@/lib/dashboard/live-rooms";

type Props = {
  room: LiveRoom;
  artistName: string;
  artistAvatar: string | null;
  initialMessages: LiveRoomMessage[];
  initialPhotos: LiveRoomPhoto[];
  viewerId: string | null;
  isHost: boolean;
  fanClubHref: string;
};

export function LiveRoomClient({
  room: initialRoom,
  artistName,
  artistAvatar,
  initialMessages,
  initialPhotos,
  viewerId,
  isHost,
  fanClubHref,
}: Props) {
  const router = useRouter();
  const [room, setRoom] = useState(initialRoom);
  const [messages, setMessages] = useState(initialMessages);
  const [photos, setPhotos] = useState(initialPhotos);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<string | null>(null);
  const [joined, setJoined] = useState(isHost);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoPending, setPhotoPending] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  async function leave() {
    if (!viewerId || isHost) return;
    try {
      await fetch(`/api/live-rooms/${room.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave" }),
        keepalive: true,
      });
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    setRoom(initialRoom);
    setMessages(initialMessages);
    setPhotos(initialPhotos);
  }, [initialRoom, initialMessages, initialPhotos]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Signed-out fans → login
  useEffect(() => {
    if (viewerId || isHost || room.status !== "live") return;
    const next = `/artists/${room.artist_id}/live/${room.id}`;
    window.location.href = `/auth/login?next=${encodeURIComponent(next)}`;
  }, [viewerId, isHost, room.status, room.artist_id, room.id]);

  useEffect(() => {
    if (!viewerId || isHost || joined || room.status !== "live") return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/live-rooms/${room.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join" }),
      });
      const data = (await res.json()) as { error?: string; code?: string };
      if (cancelled) return;
      if (res.status === 401) {
        window.location.href = `/auth/login?next=/artists/${room.artist_id}/live/${room.id}`;
        return;
      }
      if (!res.ok) {
        if (data.code === "fan_club_required") {
          setGate("fan_club");
        } else if (data.code === "private_room") {
          setGate("private");
        } else {
          setError(data.error || "Could not join");
        }
        return;
      }
      setJoined(true);
      router.refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [viewerId, isHost, joined, room.id, room.artist_id, room.status, router]);

  useEffect(() => {
    return () => {
      void leave();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, viewerId, isHost]);

  useEffect(() => {
    if (!isHost || room.status !== "live") return;
    if (room.mode === "photos") return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: room.mode === "video",
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          await localVideoRef.current.play().catch(() => undefined);
        }
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Camera/mic blocked — allow access or switch to Photos mode",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isHost, room.mode, room.status]);

  // Realtime: new messages + photos + room row
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`live-room-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_room_messages",
          filter: `live_room_id=eq.${room.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id: number;
            live_room_id: string;
            sender_id: string;
            body: string;
            created_at: string;
          };
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [
              ...prev,
              {
                id: row.id,
                live_room_id: row.live_room_id,
                sender_id: row.sender_id,
                body: row.body,
                created_at: row.created_at,
                sender_name: "Fan",
              },
            ];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_room_photos",
          filter: `live_room_id=eq.${room.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id: number;
            photo_url: string;
            caption: string | null;
            created_at: string;
          };
          setPhotos((prev) => {
            if (prev.some((p) => p.id === row.id)) return prev;
            return [
              ...prev,
              {
                id: row.id,
                photo_url: row.photo_url,
                caption: row.caption,
                created_at: row.created_at,
              },
            ];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "live_rooms",
          filter: `id=eq.${room.id}`,
        },
        (payload) => {
          const row = payload.new as LiveRoom;
          setRoom((prev) => ({ ...prev, ...row }));
          if (row.status === "ended") {
            streamRef.current?.getTracks().forEach((t) => t.stop());
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [room.id]);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (!joined && !isHost) return;
    const body = draft.trim();
    if (!body || pending) return;
    setPending(true);
    setError(null);
    setDraft("");
    try {
      const res = await fetch(`/api/live-rooms/${room.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "message", body }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: LiveRoomMessage;
      };
      if (!res.ok || !data.message) {
        setDraft(body);
        setError(data.error || "Could not send");
        return;
      }
      setMessages((prev) =>
        prev.some((m) => m.id === data.message!.id)
          ? prev
          : [...prev, { ...data.message!, sender_name: "You" }],
      );
    } catch (err) {
      setDraft(body);
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  async function pushPhoto() {
    if (!isHost || !photoUrl.trim() || photoPending || room.status !== "live") {
      return;
    }
    setPhotoPending(true);
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
      setPhotoPending(false);
    }
  }

  async function endAsHost() {
    if (!isHost || pending) return;
    setPending(true);
    try {
      await fetch("/api/live-rooms", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ live_room_id: room.id }),
      });
      router.push("/studio/live");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const stagePhoto =
    photos.length > 0
      ? photos[photos.length - 1]
      : room.stage_photo_url
        ? {
            id: 0,
            photo_url: room.stage_photo_url,
            caption: null,
            created_at: "",
          }
        : null;

  if (gate === "fan_club") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-[#040d06] px-5 text-center text-white">
        <p className="text-xs uppercase tracking-[0.2em] text-red-400">Live Room</p>
        <h1 className="mt-3 font-[family-name:var(--font-syne)] text-2xl font-semibold">
          Fan club only
        </h1>
        <p className="mt-3 max-w-sm text-sm text-white/50">
          This Live Room is for fan club members. Join the club to enter.
        </p>
        <Link
          href={fanClubHref}
          className="mt-8 rounded-full bg-[#1DB954] px-6 py-3 text-sm font-semibold text-black"
        >
          View fan club
        </Link>
        <Link
          href={`/artists/${room.artist_id}`}
          className="mt-4 text-sm text-white/45 hover:text-white"
        >
          Back to World
        </Link>
      </main>
    );
  }

  if (gate === "private") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-[#040d06] px-5 text-center text-white">
        <h1 className="font-[family-name:var(--font-syne)] text-2xl font-semibold">
          Private Live Room
        </h1>
        <Link
          href={`/artists/${room.artist_id}`}
          className="mt-8 text-sm text-[#1DB954]"
        >
          Back to World
        </Link>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-dvh flex-col bg-[#040d06] text-white">
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent px-4 py-4">
        <Link
          href={`/artists/${room.artist_id}`}
          className="rounded-full bg-black/40 px-3 py-1.5 text-sm text-white/80 backdrop-blur"
        >
          ← Exit
        </Link>
        <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs backdrop-blur">
          {room.status === "live" ? (
            <span className="flex items-center gap-1.5 font-semibold text-red-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
              LIVE
            </span>
          ) : (
            <span className="text-white/45">Ended</span>
          )}
          <span className="text-white/35">·</span>
          <span className="tabular-nums text-white/70">
            {room.viewer_count} watching
          </span>
          <span className="text-white/35">·</span>
          <span className="uppercase tracking-wider text-white/45">
            {room.mode}
          </span>
        </div>
        {isHost && room.status === "live" ? (
          <button
            type="button"
            onClick={() => void endAsHost()}
            className="rounded-full bg-red-500/90 px-3 py-1.5 text-xs font-semibold"
          >
            End
          </button>
        ) : (
          <span className="w-14" />
        )}
      </header>

      <div className="relative flex flex-1 flex-col pt-16">
        <div className="relative mx-auto w-full max-w-3xl flex-1 px-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="relative h-9 w-9 overflow-hidden rounded-full border border-white/15 bg-white/5">
              {artistAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={artistAvatar}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
            </span>
            <div>
              <p className="text-sm font-medium">{artistName}</p>
              <p className="text-xs text-white/40">{room.title}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
            {isHost && (room.mode === "video" || room.mode === "audio") ? (
              <video
                ref={localVideoRef}
                muted
                playsInline
                className={`w-full bg-black ${room.mode === "audio" ? "h-40 object-cover opacity-50" : "aspect-video object-cover"}`}
              />
            ) : null}

            {!isHost && room.mode === "video" ? (
              <div className="relative flex aspect-video flex-col items-center justify-center gap-2 bg-gradient-to-b from-[#0a1a10] to-black px-6 text-center">
                {stagePhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={stagePhoto.photo_url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover opacity-50"
                  />
                ) : null}
                <p className="relative text-sm text-white/80">
                  {artistName} is in a video Live Room
                </p>
                <p className="relative max-w-sm text-xs text-white/40">
                  Fan-side video streams ship with RECT Live (pro). Chat works
                  now — photos appear on stage when the artist pushes them.
                </p>
              </div>
            ) : null}

            {!isHost && room.mode === "audio" ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 bg-[#06140a]">
                <span className="h-3 w-3 animate-pulse rounded-full bg-[#1DB954]" />
                <p className="text-sm text-white/70">Audio Live Room</p>
                <p className="max-w-sm text-center text-xs text-white/40">
                  Fan-side audio streams ship with RECT Live (pro). Chat is live
                  now.
                </p>
              </div>
            ) : null}

            {(room.mode === "photos" || stagePhoto) && room.mode !== "video" ? (
              <div className="relative aspect-[4/5] sm:aspect-video">
                {stagePhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={stagePhoto.photo_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-white/40">
                    Waiting for photos on stage…
                  </div>
                )}
              </div>
            ) : null}

            {room.mode === "photos" && isHost ? (
              <div className="space-y-2 border-t border-white/10 p-3">
                {!stagePhoto ? (
                  <p className="text-xs text-white/40">
                    Push an https image URL to put it on stage for fans.
                  </p>
                ) : null}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    placeholder="https://… photo URL"
                    className="flex-1 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={photoPending || !photoUrl.trim()}
                    onClick={() => void pushPhoto()}
                    className="rounded-full bg-white/10 px-4 py-2 text-xs font-medium disabled:opacity-40"
                  >
                    {photoPending ? "…" : "Push photo"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {error ? (
            <p className="mt-3 text-xs text-[#F5A623]" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-4 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] p-3">
            {messages.length === 0 ? (
              <p className="text-xs text-white/35">Chat is open — say hi.</p>
            ) : null}
            {messages.map((m) => (
              <div key={m.id} className="text-sm">
                <span className="font-medium text-[#1DB954]/90">
                  {m.sender_id === viewerId
                    ? "You"
                    : m.sender_id === room.artist_id
                      ? artistName
                      : m.sender_name || "Fan"}
                </span>{" "}
                <span className="text-white/75">{m.body}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {room.status === "live" && (joined || isHost) ? (
            <form
              onSubmit={(e) => void onSend(e)}
              className="mt-3 flex gap-2 pb-8"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={500}
                placeholder="Message…"
                className="flex-1 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm"
              />
              <button
                type="submit"
                disabled={pending || !draft.trim()}
                className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
              >
                Send
              </button>
            </form>
          ) : room.status !== "live" ? (
            <p className="mt-4 pb-8 text-center text-sm text-white/40">
              This Live Room has ended.
            </p>
          ) : (
            <p className="mt-4 pb-8 text-center text-sm text-white/40">
              Joining…
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
