"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { COMMENT_THANKS_MAX } from "@/lib/dashboard/comment-thanks";
import { LIKE_THANKS_MAX } from "@/lib/dashboard/like-thanks";
import { MIX_THANKS_MAX } from "@/lib/dashboard/mix-thanks";
import { PLAY_THANKS_MAX } from "@/lib/dashboard/play-thanks";
import { PLAYLIST_COMMENT_THANKS_MAX } from "@/lib/dashboard/playlist-comment-thanks";

type PlayProps = {
  playId: string;
  likerId?: never;
  trackId?: never;
  playlistId?: never;
  commentId?: never;
  playlistCommentId?: never;
  initialThanks?: string | null;
  compact?: boolean;
};

type LikeProps = {
  playId?: never;
  likerId: string;
  trackId: string;
  playlistId?: never;
  commentId?: never;
  playlistCommentId?: never;
  initialThanks?: string | null;
  compact?: boolean;
};

type MixProps = {
  playId?: never;
  likerId?: never;
  trackId?: never;
  playlistId: string;
  commentId?: never;
  playlistCommentId?: never;
  initialThanks?: string | null;
  compact?: boolean;
};

type CommentProps = {
  playId?: never;
  likerId?: never;
  trackId?: never;
  playlistId?: never;
  commentId: number;
  playlistCommentId?: never;
  initialThanks?: string | null;
  compact?: boolean;
};

type PlaylistCommentProps = {
  playId?: never;
  likerId?: never;
  trackId?: never;
  playlistId?: never;
  commentId?: never;
  playlistCommentId: number;
  initialThanks?: string | null;
  compact?: boolean;
};

type Props =
  | PlayProps
  | LikeProps
  | MixProps
  | CommentProps
  | PlaylistCommentProps;

export function ActivityThanksButton(props: Props) {
  const { initialThanks = null, compact = false } = props;
  const isPlaylistComment =
    "playlistCommentId" in props &&
    typeof props.playlistCommentId === "number" &&
    Number.isFinite(props.playlistCommentId);
  const isComment =
    !isPlaylistComment &&
    "commentId" in props &&
    typeof props.commentId === "number" &&
    Number.isFinite(props.commentId);
  const isLike =
    !isComment &&
    !isPlaylistComment &&
    "likerId" in props &&
    Boolean(props.likerId && props.trackId);
  const isMix =
    !isComment &&
    !isPlaylistComment &&
    "playlistId" in props &&
    Boolean(props.playlistId);
  const maxLen = isMix
    ? MIX_THANKS_MAX
    : isLike
      ? LIKE_THANKS_MAX
      : isPlaylistComment
        ? PLAYLIST_COMMENT_THANKS_MAX
        : isComment
          ? COMMENT_THANKS_MAX
          : PLAY_THANKS_MAX;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [thanks, setThanks] = useState(initialThanks);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (pending || !draft.trim()) return;
    setPending(true);
    setError(null);
    try {
      const url = isMix
        ? `/api/playlists/${encodeURIComponent(props.playlistId!)}/thanks`
        : isLike
          ? "/api/likes/thanks"
          : isPlaylistComment
            ? "/api/playlist-comments/thanks"
            : isComment
              ? "/api/comments/thanks"
              : "/api/plays/thanks";
      const body = isMix
        ? { message: draft.trim() }
        : isLike
          ? {
              liker_id: props.likerId,
              track_id: props.trackId,
              message: draft.trim(),
            }
          : isPlaylistComment
            ? {
                comment_id: props.playlistCommentId,
                message: draft.trim(),
              }
            : isComment
              ? {
                  comment_id: props.commentId,
                  message: draft.trim(),
                }
              : {
                  play_id: props.playId,
                  message: draft.trim(),
                };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
      <p
        className={
          compact
            ? "max-w-[7rem] truncate text-[0.65rem] text-[#1DB954]/90"
            : "mt-1 text-xs text-[#1DB954]/90"
        }
        title={`Thanks sent: ${thanks}`}
      >
        {compact ? "Thanks ✓" : `Thanks sent: “${thanks}”`}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "shrink-0 rounded-full px-2 py-2 text-xs text-[#1DB954] hover:bg-white/10"
            : "mt-1 text-xs text-[#1DB954] hover:underline"
        }
      >
        Nice
      </button>
    );
  }

  return (
    <div
      className={
        compact
          ? "w-full max-w-[14rem] space-y-2 px-1 pb-1"
          : "mt-2 space-y-2"
      }
    >
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, maxLen))}
        maxLength={maxLen}
        rows={2}
        placeholder={
          isMix
            ? "Love this mix…"
            : isLike
              ? "Great taste…"
              : isComment || isPlaylistComment
                ? "Appreciate the note…"
                : "Nice pick…"
        }
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
