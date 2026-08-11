"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MAX_BODY = 500;

type Props = {
  /** Track comments vs playlist (mix) comments. */
  target: "track" | "playlist";
  entityId: string;
  parentCommentId: number;
  loginNext: string;
};

export function InboxCommentReply({
  target,
  entityId,
  parentCommentId,
  loginNext,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (pending || !draft.trim() || sent) return;
    setPending(true);
    setError(null);
    try {
      const path =
        target === "track"
          ? `/api/tracks/${encodeURIComponent(entityId)}/comments`
          : `/api/playlists/${encodeURIComponent(entityId)}/comments`;
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: draft,
          parent_id: parentCommentId,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (res.status === 401) {
        window.location.href = `/auth/login?next=${encodeURIComponent(loginNext)}`;
        return;
      }
      if (!res.ok || data.error) {
        setError(data.error || "Could not post reply");
        return;
      }
      setDraft("");
      setOpen(false);
      setSent(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return <p className="mt-1 text-xs text-[#1DB954]/90">Reply sent</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-xs text-[#1DB954] hover:underline"
      >
        Reply
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY))}
        maxLength={MAX_BODY}
        rows={2}
        placeholder="Write a reply…"
        disabled={pending}
        autoFocus
        className="w-full resize-none rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-white placeholder:text-white/35 focus:border-[#1DB954]/50 focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !draft.trim()}
          onClick={() => void send()}
          className="rounded-full bg-[#1DB954] px-3 py-1 text-xs font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
        >
          {pending ? "…" : "Reply"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-xs text-white/45 hover:text-white"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p className="text-xs text-[#F5A623]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
