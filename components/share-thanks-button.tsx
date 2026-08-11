"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FOLLOW_THANKS_MAX } from "@/lib/dashboard/follows";
import { PEOPLE_FOLLOW_THANKS_MAX } from "@/lib/dashboard/people-follows";
import {
  PLAYLIST_COPY_THANKS_MAX,
  PLAYLIST_FOLLOW_THANKS_MAX,
} from "@/lib/dashboard/playlist-follows";
import { COMMENT_LIKE_THANKS_MAX } from "@/lib/dashboard/comment-like-thanks";
import { SHARE_THANKS_MAX } from "@/lib/dashboard/shares";

type Endpoint =
  | "/api/shares/thanks"
  | "/api/playlist-follows/thanks"
  | "/api/playlists/copy/thanks"
  | "/api/people/follows/thanks"
  | "/api/follows/thanks"
  | "/api/comments/like/thanks";

type Props = {
  notificationId: number;
  initialThanks: string | null;
  /** Defaults to share thanks. */
  endpoint?: Endpoint;
  placeholder?: string;
};

function defaultPlaceholder(endpoint: Endpoint) {
  if (endpoint === "/api/playlist-follows/thanks") {
    return "Thanks for saving my mix…";
  }
  if (endpoint === "/api/playlists/copy/thanks") {
    return "Thanks for copying my mix…";
  }
  if (
    endpoint === "/api/people/follows/thanks" ||
    endpoint === "/api/follows/thanks"
  ) {
    return "Thanks for following…";
  }
  if (endpoint === "/api/comments/like/thanks") {
    return "Thanks for liking my comment…";
  }
  return "Thanks for sending this…";
}

function maxFor(endpoint: Endpoint) {
  if (endpoint === "/api/playlist-follows/thanks") {
    return PLAYLIST_FOLLOW_THANKS_MAX;
  }
  if (endpoint === "/api/playlists/copy/thanks") {
    return PLAYLIST_COPY_THANKS_MAX;
  }
  if (endpoint === "/api/people/follows/thanks") {
    return PEOPLE_FOLLOW_THANKS_MAX;
  }
  if (endpoint === "/api/follows/thanks") {
    return FOLLOW_THANKS_MAX;
  }
  if (endpoint === "/api/comments/like/thanks") {
    return COMMENT_LIKE_THANKS_MAX;
  }
  return SHARE_THANKS_MAX;
}

export function ShareThanksButton({
  notificationId,
  initialThanks,
  endpoint = "/api/shares/thanks",
  placeholder = defaultPlaceholder(endpoint),
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [thanks, setThanks] = useState(initialThanks);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxLen = maxFor(endpoint);

  async function send() {
    if (pending || !draft.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notification_id: notificationId,
          message: draft.trim(),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        thanks_message?: string;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Could not send thanks");
        return;
      }
      setThanks(data.thanks_message || draft.trim());
      setDraft("");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  if (thanks) {
    return (
      <p className="mt-1 text-xs text-[#1DB954]/90">
        Thanks sent: “{thanks}”
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-xs text-[#1DB954] hover:underline"
      >
        Say thanks
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, maxLen))}
        maxLength={maxLen}
        rows={2}
        placeholder={placeholder}
        disabled={pending}
        className="w-full resize-none rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-white placeholder:text-white/35 focus:border-[#1DB954]/50 focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !draft.trim()}
          onClick={() => void send()}
          className="rounded-full bg-[#1DB954] px-3 py-1 text-xs font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
        >
          {pending ? "…" : "Send"}
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
