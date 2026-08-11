"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SHARE_NOTE_MAX, type ShareRecipient } from "@/lib/dashboard/shares";

type Props = {
  kind: "track" | "playlist";
  targetId: string;
  loginNext?: string;
  onSent?: () => void;
};

export function SendToFriendPanel({
  kind,
  targetId,
  loginNext,
  onSent,
}: Props) {
  const router = useRouter();
  const [recipients, setRecipients] = useState<ShareRecipient[] | null>(null);
  const [missingFollows, setMissingFollows] = useState(false);
  const [note, setNote] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentName, setSentName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/shares");
        const data = (await res.json()) as {
          recipients?: ShareRecipient[];
          error?: string;
          code?: string;
        };
        if (cancelled) return;
        if (res.status === 401) {
          setRecipients([]);
          return;
        }
        if (res.status === 503 || data.code === "missing_table") {
          setMissingFollows(true);
          setRecipients([]);
          return;
        }
        if (!res.ok) {
          setError(data.error || "Could not load people");
          setRecipients([]);
          return;
        }
        setRecipients(data.recipients ?? []);
      } catch {
        if (!cancelled) {
          setError("Network error");
          setRecipients([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function send(person: ShareRecipient) {
    if (pendingId) return;
    setPendingId(person.id);
    setError(null);
    setSentName(null);
    try {
      const res = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          id: targetId,
          recipient_id: person.id,
          note: note.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (res.status === 401) {
        const next = loginNext || "/following";
        router.push(`/auth/login?next=${encodeURIComponent(next)}`);
        return;
      }
      if (!res.ok || data.error) {
        setError(data.error || "Could not send");
        return;
      }
      setSentName(person.display_name);
      setNote("");
      onSent?.();
      window.setTimeout(() => setSentName(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div>
      <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-white/40">
        Send to
      </p>
      <label className="mb-2 block">
        <span className="sr-only">Optional note</span>
        <input
          type="text"
          value={note}
          maxLength={SHARE_NOTE_MAX}
          onChange={(e) => setNote(e.target.value.slice(0, SHARE_NOTE_MAX))}
          placeholder="Optional note"
          disabled={pendingId != null}
          className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-white/35 focus:border-[#1DB954]/50 focus:outline-none"
        />
      </label>

      {recipients == null ? (
        <p className="text-xs text-white/40">Loading…</p>
      ) : missingFollows ? (
        <p className="text-xs text-white/45">
          Run people follows SQL to send in-app.
        </p>
      ) : recipients.length === 0 ? (
        <p className="text-xs text-white/45">
          Follow people first.{" "}
          <Link href="/following" className="text-[#1DB954] hover:underline">
            Following
          </Link>
        </p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {recipients.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={pendingId != null}
                onClick={() => void send(p)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/10 disabled:opacity-50"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.06] text-[0.55rem] text-white/40">
                  {p.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (p.display_name.slice(0, 1) || "?").toUpperCase()
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {pendingId === p.id ? "…" : p.display_name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {sentName ? (
        <p className="mt-2 text-xs text-[#1DB954]">Sent to {sentName}</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-[#F5A623]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
