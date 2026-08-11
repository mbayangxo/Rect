"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  formatCommentTime,
  type PlaylistComment,
} from "@/lib/dashboard/playlist-comments";
import { personProfileHref } from "@/lib/dashboard/people";

type Props = {
  playlistId: string;
  initialComments: PlaylistComment[];
  missingTable: boolean;
  loadError: string | null;
  signedIn: boolean;
  currentUserId: string | null;
  isOwner: boolean;
  loginNext: string;
  canComment: boolean;
  likesReady?: boolean;
};

export function PlaylistComments({
  playlistId,
  initialComments,
  missingTable,
  loadError,
  signedIn,
  currentUserId,
  isOwner,
  loginNext,
  canComment,
  likesReady = false,
}: Props) {
  const router = useRouter();
  const [comments, setComments] = useState(initialComments);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<PlaylistComment | null>(null);
  const [pending, setPending] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [likingId, setLikingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setComments(initialComments);
  }, [initialComments]);

  const roots = useMemo(
    () => comments.filter((c) => c.parent_id == null),
    [comments],
  );
  const repliesByParent = useMemo(() => {
    const map = new Map<number, PlaylistComment[]>();
    for (const c of comments) {
      if (c.parent_id == null) continue;
      const list = map.get(c.parent_id) ?? [];
      list.push(c);
      map.set(c.parent_id, list);
    }
    return map;
  }, [comments]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || !canComment) return;
    if (!signedIn) {
      window.location.href = `/auth/login?next=${encodeURIComponent(loginNext)}`;
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: draft,
          parent_id: replyTo?.id,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        comment?: PlaylistComment;
      };
      if (res.status === 401) {
        window.location.href = `/auth/login?next=${encodeURIComponent(loginNext)}`;
        return;
      }
      if (!res.ok || data.error || !data.comment) {
        setError(data.error || "Could not post comment");
        return;
      }
      setComments((list) => [...list, data.comment!]);
      setDraft("");
      setReplyTo(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  async function remove(commentId: number) {
    if (deletingId != null) return;
    setDeletingId(commentId);
    setError(null);
    const prev = comments;
    setComments((list) =>
      list.filter((c) => c.id !== commentId && c.parent_id !== commentId),
    );
    try {
      const res = await fetch(
        `/api/playlists/${playlistId}/comments?comment_id=${commentId}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setComments(prev);
        setError(data.error || "Could not delete");
        return;
      }
      if (replyTo?.id === commentId) setReplyTo(null);
      router.refresh();
    } catch (err) {
      setComments(prev);
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleLike(commentId: number) {
    if (!likesReady || likingId != null) return;
    if (!signedIn) {
      window.location.href = `/auth/login?next=${encodeURIComponent(loginNext)}`;
      return;
    }
    setLikingId(commentId);
    setError(null);
    const prev = comments;
    setComments((list) =>
      list.map((c) => {
        if (c.id !== commentId) return c;
        const liked = !c.liked_by_me;
        return {
          ...c,
          liked_by_me: liked,
          like_count: Math.max(0, c.like_count + (liked ? 1 : -1)),
        };
      }),
    );
    try {
      const res = await fetch(`/api/playlists/${playlistId}/comments/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment_id: commentId }),
      });
      const data = (await res.json()) as {
        error?: string;
        liked?: boolean;
        like_count?: number;
      };
      if (res.status === 401) {
        setComments(prev);
        window.location.href = `/auth/login?next=${encodeURIComponent(loginNext)}`;
        return;
      }
      if (!res.ok || data.error) {
        setComments(prev);
        setError(data.error || "Could not like");
        return;
      }
      setComments((list) =>
        list.map((c) =>
          c.id === commentId
            ? {
                ...c,
                liked_by_me: Boolean(data.liked),
                like_count:
                  typeof data.like_count === "number"
                    ? data.like_count
                    : c.like_count,
              }
            : c,
        ),
      );
      router.refresh();
    } catch (err) {
      setComments(prev);
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLikingId(null);
    }
  }

  function renderComment(c: PlaylistComment, isReply: boolean) {
    const canDelete = currentUserId === c.user_id || isOwner;
    return (
      <div
        key={c.id}
        className={`rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 ${
          isReply ? "ml-4 border-l border-l-[#1DB954]/30 sm:ml-6" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <Link
                href={personProfileHref(c.user_id)}
                className="font-medium text-[#1DB954] hover:underline"
              >
                {c.author_name}
              </Link>
              <span className="ml-2 text-xs text-white/35">
                {formatCommentTime(c.created_at)}
              </span>
            </p>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-white/80">
              {c.body}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {likesReady ? (
                <button
                  type="button"
                  disabled={likingId === c.id}
                  onClick={() => void toggleLike(c.id)}
                  className={`text-xs disabled:opacity-40 ${
                    c.liked_by_me
                      ? "text-[#1DB954]"
                      : "text-white/40 hover:text-[#1DB954]"
                  }`}
                >
                  {likingId === c.id
                    ? "…"
                    : c.liked_by_me
                      ? `Liked${c.like_count > 0 ? ` · ${c.like_count}` : ""}`
                      : c.like_count > 0
                        ? `Like · ${c.like_count}`
                        : "Like"}
                </button>
              ) : null}
              {!isReply && !missingTable && canComment ? (
                <button
                  type="button"
                  onClick={() => {
                    setReplyTo(c);
                    setError(null);
                  }}
                  className="text-xs text-white/40 hover:text-[#1DB954]"
                >
                  Reply
                </button>
              ) : null}
            </div>
          </div>
          {canDelete ? (
            <button
              type="button"
              onClick={() => void remove(c.id)}
              disabled={deletingId === c.id}
              className="shrink-0 text-xs text-white/35 hover:text-red-300 disabled:opacity-40"
            >
              {deletingId === c.id ? "…" : "Delete"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <section className="mt-2">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
        Comments
        {comments.length > 0 ? ` · ${comments.length}` : ""}
      </h2>

      {missingTable ? (
        <p className="text-sm text-white/40">
          Run{" "}
          <code className="text-[#1DB954]">20260809_playlist_comments.sql</code>{" "}
          in Supabase to enable comments.
        </p>
      ) : null}

      {loadError || error ? (
        <p className="mb-3 text-sm text-[#1DB954]" role="alert">
          {error || loadError}
        </p>
      ) : null}

      {!missingTable && canComment ? (
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          {replyTo ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-[#1DB954]/25 bg-[#1DB954]/5 px-3 py-2 text-xs text-white/60">
              <span>
                Replying to{" "}
                <span className="text-[#1DB954]">{replyTo.author_name}</span>
              </span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="text-white/45 hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : null}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={
              !signedIn
                ? "Sign in to leave a comment"
                : replyTo
                  ? "Write a reply…"
                  : "Say something about this mix…"
            }
            disabled={pending}
            className="w-full resize-y rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-[#1DB954]/50 focus:outline-none disabled:opacity-50"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.65rem] text-white/30">{draft.length}/500</p>
            <button
              type="submit"
              disabled={pending || !draft.trim()}
              className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-semibold text-black hover:bg-[#17a349] disabled:opacity-40"
            >
              {pending
                ? "…"
                : !signedIn
                  ? "Sign in to post"
                  : replyTo
                    ? "Reply"
                    : "Post"}
            </button>
          </div>
        </form>
      ) : null}

      {!missingTable && !canComment ? (
        <p className="text-sm text-white/40">
          Comments open when this mix is public, or if you own / collab on it.
        </p>
      ) : null}

      {!missingTable && comments.length === 0 && !loadError && canComment ? (
        <p className="mt-4 text-sm text-white/40">No comments yet — be first.</p>
      ) : null}

      {roots.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {roots.map((c) => (
            <li key={c.id} className="list-none space-y-2">
              {renderComment(c, false)}
              {(repliesByParent.get(c.id) ?? []).map((r) =>
                renderComment(r, true),
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
