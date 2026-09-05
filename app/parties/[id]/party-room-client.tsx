"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayer } from "@/components/player-provider";
import type {
  HostTrackOption,
  ListeningParty,
  PartyMessage,
} from "@/lib/dashboard/listening-parties";
import { createClient } from "@/lib/supabase/client";
import { trackTitle, type TrackRow } from "@/lib/tracks";

type Props = {
  party: ListeningParty;
  initialMessages: PartyMessage[];
  track: TrackRow | null;
  userId: string;
  isHost: boolean;
  hostTracks?: HostTrackOption[];
};

const GIF_SHORTCUTS = [
  { label: "🔥", url: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif" },
  { label: "💃", url: "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif" },
  { label: "👏", url: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif" },
];

export function PartyRoomClient({
  party: initialParty,
  initialMessages,
  track: initialTrack,
  userId,
  isHost,
  hostTracks = [],
}: Props) {
  const player = usePlayer();
  const [party, setParty] = useState(initialParty);
  const [messages, setMessages] = useState(initialMessages);
  const [activeTrack, setActiveTrack] = useState<TrackRow | null>(initialTrack);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState(initialParty.status);
  const [error, setError] = useState<string | null>(null);
  const [pickedTrackId, setPickedTrackId] = useState(initialTrack?.id ?? "");
  const [showSwap, setShowSwap] = useState(!initialTrack);
  const lastPlayedId = useRef<string | null>(null);

  const playableHostTracks = hostTracks.filter((t) => t.audio_url);

  const playIfNeeded = useCallback(
    (next: TrackRow | null, liveStatus: string) => {
      if (!next?.audio_url || liveStatus !== "live") return;
      if (lastPlayedId.current === next.id) return;
      lastPlayedId.current = next.id;
      player.play(next);
    },
    [player],
  );

  const applySnapshot = useCallback(
    (data: {
      party?: ListeningParty;
      messages?: PartyMessage[];
      track?: TrackRow | null;
    }) => {
      if (data.messages) setMessages(data.messages);
      if (data.party) {
        setParty(data.party);
        if (data.party.status) setStatus(data.party.status);
      }
      if (data.track !== undefined) {
        const next = data.track;
        setActiveTrack(next);
        if (next?.id) setPickedTrackId(next.id);
        playIfNeeded(next, data.party?.status ?? status);
      } else if (data.party && !data.party.track_id) {
        setActiveTrack(null);
        lastPlayedId.current = null;
      }
    },
    [playIfNeeded, status],
  );

  const refreshRoom = useCallback(async () => {
    try {
      const res = await fetch(`/api/listening-parties/${initialParty.id}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        party?: ListeningParty;
        messages?: PartyMessage[];
        track?: TrackRow | null;
      };
      applySnapshot(data);
    } catch {
      /* ignore */
    }
  }, [applySnapshot, initialParty.id]);

  // Play when server-rendered track arrives / changes via props.
  useEffect(() => {
    setParty(initialParty);
    setStatus(initialParty.status);
    setActiveTrack(initialTrack);
    if (initialTrack?.id) setPickedTrackId(initialTrack.id);
    playIfNeeded(initialTrack, initialParty.status);
  }, [initialParty, initialTrack, playIfNeeded]);

  // Poll: always apply track payload so guests hear host swaps without refresh.
  useEffect(() => {
    if (status !== "live") return;
    const ms = activeTrack ? 3500 : 2000;
    const t = setInterval(() => {
      void refreshRoom();
    }, ms);
    return () => clearInterval(t);
  }, [status, activeTrack, refreshRoom]);

  // Best-effort realtime (works when Supabase replication is on for these tables).
  useEffect(() => {
    if (status !== "live") return;
    const supabase = createClient();
    const channel = supabase
      .channel(`party-room-${initialParty.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "listening_parties",
          filter: `id=eq.${initialParty.id}`,
        },
        () => {
          void refreshRoom();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "listening_party_messages",
          filter: `party_id=eq.${initialParty.id}`,
        },
        () => {
          void refreshRoom();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [initialParty.id, status, refreshRoom]);

  async function send(
    body: string,
    kind: "text" | "gif" = "text",
    mediaUrl?: string,
  ) {
    if (pending || status !== "live") return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/listening-parties/${party.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "message",
          body,
          kind,
          media_url: mediaUrl,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Send failed.");
        return;
      }
      setText("");
      setMessages((m) => [
        ...m,
        {
          id: Date.now(),
          party_id: party.id,
          sender_id: userId,
          body: body || "GIF",
          kind,
          media_url: mediaUrl ?? null,
          created_at: new Date().toISOString(),
          sender_name: "You",
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  async function endParty() {
    if (!isHost || pending) return;
    setPending(true);
    try {
      await fetch(`/api/listening-parties/${party.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end" }),
      });
      setStatus("ended");
      await refreshRoom();
    } finally {
      setPending(false);
    }
  }

  async function linkTrack() {
    if (!isHost || !pickedTrackId || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/listening-parties/${party.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_track",
          track_id: pickedTrackId,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not set track.");
        return;
      }
      lastPlayedId.current = null;
      setShowSwap(false);
      await refreshRoom();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#040d06] pb-28 text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-4">
          <div>
            <Link href="/parties" className="text-xs text-white/40 hover:text-white">
              ← Parties
            </Link>
            <h1 className="mt-1 font-[family-name:var(--font-syne)] text-xl font-semibold">
              {party.title}
            </h1>
            <p className="text-xs text-white/40">
              Invite code{" "}
              <span className="font-mono uppercase text-[var(--rect)]">
                {party.invite_code}
              </span>
              {status === "ended" ? " · ended" : " · live"}
            </p>
          </div>
          {isHost && status === "live" ? (
            <button
              type="button"
              onClick={() => void endParty()}
              className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/50"
            >
              End
            </button>
          ) : null}
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl space-y-6 px-5 py-6">
        {activeTrack ? (
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <span
              className="h-14 w-14 shrink-0 rounded-lg bg-white/10"
              style={
                activeTrack.cover_art_url
                  ? {
                      backgroundImage: `url(${activeTrack.cover_art_url})`,
                      backgroundSize: "cover",
                    }
                  : undefined
              }
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{trackTitle(activeTrack)}</p>
              <p className="text-xs text-white/40">Playing for the room</p>
            </div>
            {isHost && status === "live" && playableHostTracks.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowSwap((v) => !v)}
                className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/55 hover:text-white"
              >
                {showSwap ? "Cancel" : "Change"}
              </button>
            ) : null}
          </div>
        ) : !isHost ? (
          <p className="text-sm text-white/40">
            No track linked yet — waiting for the host…
          </p>
        ) : null}

        {isHost &&
        status === "live" &&
        (showSwap || !activeTrack) &&
        playableHostTracks.length > 0 ? (
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm text-white/55">
              {activeTrack ? "Switch the room track" : "Pick a track for the room"}
            </p>
            <select
              value={pickedTrackId}
              onChange={(e) => setPickedTrackId(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none focus:border-[var(--rect)]/50"
            >
              <option value="">Choose a track…</option>
              {playableHostTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {trackTitle(t)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={
                pending ||
                !pickedTrackId ||
                pickedTrackId === activeTrack?.id
              }
              onClick={() => void linkTrack()}
              className="rounded-full bg-[var(--rect)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
            >
              {pending
                ? "Updating…"
                : activeTrack
                  ? "Play this track for room"
                  : "Set track"}
            </button>
          </div>
        ) : null}

        {isHost &&
        status === "live" &&
        !activeTrack &&
        playableHostTracks.length === 0 ? (
          <p className="text-sm text-white/40">
            No tracks with audio yet.{" "}
            <Link href="/studio/upload" className="text-[var(--rect)]">
              Upload →
            </Link>
          </p>
        ) : null}

        <div className="flex min-h-[280px] flex-col rounded-2xl border border-white/10 bg-black/20">
          <ul className="max-h-[50vh] flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <li className="text-sm text-white/35">Say hello — chat is open.</li>
            ) : (
              messages.map((m) => (
                <li key={m.id} className="text-sm">
                  <span className="text-white/40">
                    {m.sender_name ?? "Fan"} ·{" "}
                  </span>
                  {m.kind === "gif" && m.media_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.media_url}
                      alt=""
                      className="mt-1 max-h-32 rounded-lg"
                    />
                  ) : (
                    <span>{m.body}</span>
                  )}
                </li>
              ))
            )}
          </ul>
          {status === "live" ? (
            <div className="space-y-2 border-t border-white/10 p-3">
              <div className="flex gap-2">
                {GIF_SHORTCUTS.map((g) => (
                  <button
                    key={g.label}
                    type="button"
                    disabled={pending}
                    onClick={() => void send(g.label, "gif", g.url)}
                    className="rounded-lg border border-white/10 px-2 py-1 text-sm"
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim()) void send(text.trim());
                }}
              >
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Message…"
                  className="flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[var(--rect)]/50"
                />
                <button
                  type="submit"
                  disabled={pending || !text.trim()}
                  className="rounded-full bg-[var(--rect)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
                >
                  Send
                </button>
              </form>
            </div>
          ) : (
            <p className="border-t border-white/10 p-3 text-sm text-white/40">
              Party ended.
            </p>
          )}
        </div>
        {error ? <p className="text-sm text-[#F5A623]">{error}</p> : null}
      </div>
    </main>
  );
}
