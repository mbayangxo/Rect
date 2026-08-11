import type { SupabaseClient } from "@supabase/supabase-js";
import { isPublishedTrack } from "@/lib/tracks";

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

function isMissingColumn(message: string) {
  return /column .* does not exist|PGRST204/i.test(message);
}

export type TrackComment = {
  id: number;
  track_id: string;
  user_id: string;
  body: string;
  created_at: string | null;
  author_name: string;
  parent_id: number | null;
  like_count: number;
  liked_by_me: boolean;
};

const MAX_BODY = 500;

export function normalizeCommentBody(raw: string): string | null {
  const body = raw.replace(/\s+/g, " ").trim();
  if (!body || body.length > MAX_BODY) return null;
  return body;
}

export async function loadTrackComments(
  supabase: SupabaseClient,
  trackId: string,
  opts?: { limit?: number; viewerId?: string | null },
): Promise<{
  comments: TrackComment[];
  missingTable: boolean;
  likesReady: boolean;
  error: string | null;
}> {
  const limit = opts?.limit ?? 80;
  const viewerId = opts?.viewerId ?? null;
  try {
    let { data, error } = await supabase
      .from("track_comments")
      .select("id, track_id, user_id, body, created_at, parent_id")
      .eq("track_id", trackId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error && isMissingColumn(error.message)) {
      const lean = await supabase
        .from("track_comments")
        .select("id, track_id, user_id, body, created_at")
        .eq("track_id", trackId)
        .order("created_at", { ascending: true })
        .limit(limit);
      data = lean.data;
      error = lean.error;
    }

    if (error) {
      if (isMissingRelation(error.message)) {
        return {
          comments: [],
          missingTable: true,
          likesReady: false,
          error: null,
        };
      }
      return {
        comments: [],
        missingTable: false,
        likesReady: false,
        error: error.message,
      };
    }

    const rows = data ?? [];
    if (rows.length === 0) {
      return {
        comments: [],
        missingTable: false,
        likesReady: true,
        error: null,
      };
    }

    const userIds = [
      ...new Set(rows.map((r) => r.user_id as string).filter(Boolean)),
    ];
    const nameById = new Map<string, string>();
    if (userIds.length > 0) {
      const usersRes = await supabase
        .from("users")
        .select("id, display_name")
        .in("id", userIds);
      for (const u of usersRes.data ?? []) {
        const name =
          typeof u.display_name === "string" ? u.display_name.trim() : "";
        nameById.set(String(u.id), name || "Listener");
      }
    }

    const commentIds = rows.map((r) => Number(r.id)).filter(Number.isFinite);
    const likeCountById = new Map<number, number>();
    const likedByMe = new Set<number>();
    let likesReady = true;

    if (commentIds.length > 0) {
      const { data: likeRows, error: likeError } = await supabase
        .from("comment_likes")
        .select("comment_id, user_id")
        .in("comment_id", commentIds);

      if (likeError) {
        if (isMissingRelation(likeError.message)) {
          likesReady = false;
        }
      } else {
        for (const row of likeRows ?? []) {
          const cid = Number(row.comment_id);
          likeCountById.set(cid, (likeCountById.get(cid) ?? 0) + 1);
          if (viewerId && row.user_id === viewerId) {
            likedByMe.add(cid);
          }
        }
      }
    }

    const comments: TrackComment[] = rows.map((r) => {
      const id = Number(r.id);
      return {
        id,
        track_id: String(r.track_id),
        user_id: String(r.user_id),
        body: String(r.body ?? ""),
        created_at: (r.created_at as string | null) ?? null,
        author_name: nameById.get(String(r.user_id)) || "Listener",
        parent_id:
          (r as { parent_id?: number | null }).parent_id != null
            ? Number((r as { parent_id: number }).parent_id)
            : null,
        like_count: likeCountById.get(id) ?? 0,
        liked_by_me: likedByMe.has(id),
      };
    });

    return { comments, missingTable: false, likesReady, error: null };
  } catch (e) {
    return {
      comments: [],
      missingTable: false,
      likesReady: false,
      error: e instanceof Error ? e.message : "Failed to load comments",
    };
  }
}

export async function createTrackComment(
  supabase: SupabaseClient,
  trackId: string,
  bodyRaw: string,
  parentId?: number | null,
): Promise<
  | { ok: true; comment: TrackComment; notified: "artist" | "parent" | "none" }
  | {
      ok: false;
      error: string;
      code?:
        | "not_authenticated"
        | "missing_table"
        | "invalid_body"
        | "track_not_found"
        | "not_published"
        | "parent_not_found"
        | "failed";
    }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: "Sign in required",
      code: "not_authenticated",
    };
  }

  const body = normalizeCommentBody(bodyRaw);
  if (!body) {
    return {
      ok: false,
      error: `Comment must be 1–${MAX_BODY} characters`,
      code: "invalid_body",
    };
  }

  const { data: track, error: trackError } = await supabase
    .from("tracks")
    .select("id, artist_id, status")
    .eq("id", trackId)
    .maybeSingle();

  if (trackError) {
    return { ok: false, error: trackError.message, code: "failed" };
  }
  if (!track) {
    return { ok: false, error: "Track not found", code: "track_not_found" };
  }

  const isOwner = track.artist_id === user.id;
  if (!isPublishedTrack(track) && !isOwner) {
    return {
      ok: false,
      error: "Track is not published",
      code: "not_published",
    };
  }

  // Block either direction with artist — no commenting across a block
  if (typeof track.artist_id === "string" && track.artist_id && !isOwner) {
    try {
      const { data: blocked } = await supabase.rpc("users_are_blocked", {
        p_a: user.id,
        p_b: track.artist_id,
      });
      if (blocked === true) {
        return {
          ok: false,
          error: "You can’t comment on this track",
          code: "failed",
        };
      }
    } catch {
      // blocks SQL not applied — allow
    }
  }

  let resolvedParent: number | null = null;
  if (parentId != null && Number.isFinite(parentId)) {
    const { data: parent, error: parentError } = await supabase
      .from("track_comments")
      .select("id, track_id, parent_id, user_id")
      .eq("id", parentId)
      .maybeSingle();

    if (parentError) {
      if (isMissingColumn(parentError.message)) {
        return {
          ok: false,
          error: "Run comment replies SQL in Supabase first",
          code: "missing_table",
        };
      }
      return { ok: false, error: parentError.message, code: "failed" };
    }
    if (!parent || String(parent.track_id) !== trackId) {
      return {
        ok: false,
        error: "Parent comment not found",
        code: "parent_not_found",
      };
    }

    const parentAuthor = parent.user_id as string | undefined;
    if (parentAuthor && parentAuthor !== user.id) {
      try {
        const { data: blockedParent } = await supabase.rpc("users_are_blocked", {
          p_a: user.id,
          p_b: parentAuthor,
        });
        if (blockedParent === true) {
          return {
            ok: false,
            error: "You can’t reply to this comment",
            code: "failed",
          };
        }
      } catch {
        // allow
      }
    }

    // One level only — reply to a reply attaches to the root
    const nestedParent = (parent as { parent_id?: number | null }).parent_id;
    resolvedParent =
      nestedParent != null ? Number(nestedParent) : Number(parent.id);
  }

  const insertRow: Record<string, unknown> = {
    track_id: trackId,
    user_id: user.id,
    body,
  };
  if (resolvedParent != null) {
    insertRow.parent_id = resolvedParent;
  }

  let { data, error } = await supabase
    .from("track_comments")
    .insert(insertRow)
    .select("id, track_id, user_id, body, created_at, parent_id")
    .maybeSingle();

  if (error && resolvedParent != null && isMissingColumn(error.message)) {
    return {
      ok: false,
      error: "Run comment replies SQL in Supabase first",
      code: "missing_table",
    };
  }

  if (error && isMissingColumn(error.message)) {
    const lean = await supabase
      .from("track_comments")
      .insert({
        track_id: trackId,
        user_id: user.id,
        body,
      })
      .select("id, track_id, user_id, body, created_at")
      .maybeSingle();
    data = lean.data
      ? { ...lean.data, parent_id: null }
      : null;
    error = lean.error;
  }

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run track comments SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  if (!data) {
    return { ok: false, error: "Could not save comment", code: "failed" };
  }

  let authorName = "You";
  const { data: me } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (typeof me?.display_name === "string" && me.display_name.trim()) {
    authorName = me.display_name.trim();
  }

  const comment: TrackComment = {
    id: Number(data.id),
    track_id: String(data.track_id),
    user_id: String(data.user_id),
    body: String(data.body ?? ""),
    created_at: (data.created_at as string | null) ?? null,
    author_name: authorName,
    parent_id:
      (data as { parent_id?: number | null }).parent_id != null
        ? Number((data as { parent_id: number }).parent_id)
        : resolvedParent,
    like_count: 0,
    liked_by_me: false,
  };

  return {
    ok: true,
    comment,
    notified: comment.parent_id != null ? "parent" : "artist",
  };
}

export async function deleteTrackComment(
  supabase: SupabaseClient,
  commentId: number,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: string;
      code?: "not_authenticated" | "missing_table" | "not_found" | "failed";
    }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: "Sign in required",
      code: "not_authenticated",
    };
  }

  const { data, error } = await supabase
    .from("track_comments")
    .delete()
    .eq("id", commentId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run track comments SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  if (!data) {
    return { ok: false, error: "Comment not found", code: "not_found" };
  }

  return { ok: true };
}

export async function toggleCommentLike(
  supabase: SupabaseClient,
  commentId: number,
): Promise<
  | { ok: true; liked: boolean; like_count: number; comment_id: number }
  | {
      ok: false;
      error: string;
      code?:
        | "not_authenticated"
        | "missing_table"
        | "comment_not_found"
        | "failed";
    }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: "Sign in required",
      code: "not_authenticated",
    };
  }

  const { data, error } = await supabase.rpc("toggle_comment_like", {
    p_comment_id: commentId,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run comment likes SQL in Supabase first",
        code: "missing_table",
      };
    }
    if (/comment_not_found/i.test(error.message)) {
      return {
        ok: false,
        error: "Comment not found",
        code: "comment_not_found",
      };
    }
    if (/not_authenticated/i.test(error.message)) {
      return {
        ok: false,
        error: "Sign in required",
        code: "not_authenticated",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as {
    liked?: boolean;
    like_count?: number;
    comment_id?: number;
  } | null;

  return {
    ok: true,
    liked: Boolean(row?.liked),
    like_count: Number(row?.like_count) || 0,
    comment_id: Number(row?.comment_id) || commentId,
  };
}

export type ArtistRecentComment = {
  id: number;
  user_id: string;
  display_name: string;
  body: string;
  track_id: string;
  track_title: string;
  created_at: string | null;
  parent_id: number | null;
};

export type ArtistRecentCommentsResult = {
  comments: ArtistRecentComment[];
  missingTable: boolean;
  error: string | null;
};

/**
 * Recent comments across an artist's catalog (studio roster).
 */
export async function loadArtistRecentComments(
  supabase: SupabaseClient,
  artistId: string,
  limit = 24,
): Promise<ArtistRecentCommentsResult> {
  try {
    const { data: tracks, error: trackError } = await supabase
      .from("tracks")
      .select("id, title")
      .eq("artist_id", artistId)
      .limit(200);

    if (trackError) {
      if (isMissingRelation(trackError.message)) {
        return { comments: [], missingTable: true, error: null };
      }
      return { comments: [], missingTable: false, error: trackError.message };
    }

    const trackRows = (tracks ?? []).filter((t) => t.id);
    if (trackRows.length === 0) {
      return { comments: [], missingTable: false, error: null };
    }

    const titleById = new Map(
      trackRows.map((t) => [
        t.id as string,
        typeof t.title === "string" && t.title.trim()
          ? t.title.trim()
          : "Track",
      ]),
    );
    const trackIds = trackRows.map((t) => t.id as string);

    let { data: rows, error } = await supabase
      .from("track_comments")
      .select("id, track_id, user_id, body, created_at, parent_id")
      .in("track_id", trackIds)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error && isMissingColumn(error.message)) {
      const lean = await supabase
        .from("track_comments")
        .select("id, track_id, user_id, body, created_at")
        .in("track_id", trackIds)
        .order("created_at", { ascending: false })
        .limit(limit);
      rows = lean.data;
      error = lean.error;
    }

    if (error) {
      if (isMissingRelation(error.message)) {
        return { comments: [], missingTable: true, error: null };
      }
      return { comments: [], missingTable: false, error: error.message };
    }

    const commentRows = rows ?? [];
    if (commentRows.length === 0) {
      return { comments: [], missingTable: false, error: null };
    }

    const userIds = [
      ...new Set(commentRows.map((r) => r.user_id as string).filter(Boolean)),
    ];
    const nameById = new Map<string, string>();
    if (userIds.length > 0) {
      const usersRes = await supabase
        .from("users")
        .select("id, display_name")
        .in("id", userIds);
      for (const u of usersRes.data ?? []) {
        const name =
          typeof u.display_name === "string" ? u.display_name.trim() : "";
        nameById.set(String(u.id), name || "Listener");
      }
    }

    const comments: ArtistRecentComment[] = [];
    for (const r of commentRows) {
      const id = Number(r.id);
      const uid = String(r.user_id ?? "");
      const tid = String(r.track_id ?? "");
      if (!Number.isFinite(id) || !uid || !tid) continue;
      const body = String(r.body ?? "").trim();
      if (!body) continue;
      comments.push({
        id,
        user_id: uid,
        display_name: nameById.get(uid) ?? "Listener",
        body: body.length > 160 ? `${body.slice(0, 157)}…` : body,
        track_id: tid,
        track_title: titleById.get(tid) ?? "Track",
        created_at: (r.created_at as string | null) ?? null,
        parent_id:
          (r as { parent_id?: number | null }).parent_id != null
            ? Number((r as { parent_id: number }).parent_id)
            : null,
      });
    }

    return { comments, missingTable: false, error: null };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Failed to load recent comments";
    return {
      comments: [],
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

export function formatCommentTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
