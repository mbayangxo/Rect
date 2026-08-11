import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCommentTime } from "@/lib/dashboard/comments";

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

function isMissingColumn(message: string) {
  return /column .* does not exist|PGRST204/i.test(message);
}

export type PlaylistComment = {
  id: number;
  playlist_id: string;
  user_id: string;
  body: string;
  created_at: string | null;
  author_name: string;
  parent_id: number | null;
  like_count: number;
  liked_by_me: boolean;
};

const MAX_BODY = 500;

export function normalizePlaylistCommentBody(raw: string): string | null {
  const body = raw.replace(/\s+/g, " ").trim();
  if (!body || body.length > MAX_BODY) return null;
  return body;
}

export { formatCommentTime };

export async function loadPlaylistComments(
  supabase: SupabaseClient,
  playlistId: string,
  opts?: { limit?: number; viewerId?: string | null },
): Promise<{
  comments: PlaylistComment[];
  missingTable: boolean;
  likesReady: boolean;
  error: string | null;
}> {
  const limit = opts?.limit ?? 80;
  const viewerId = opts?.viewerId ?? null;
  try {
    let { data, error } = await supabase
      .from("playlist_comments")
      .select("id, playlist_id, user_id, body, created_at, parent_id")
      .eq("playlist_id", playlistId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error && isMissingColumn(error.message)) {
      const lean = await supabase
        .from("playlist_comments")
        .select("id, playlist_id, user_id, body, created_at")
        .eq("playlist_id", playlistId)
        .order("created_at", { ascending: true })
        .limit(limit);
      data = lean.data as typeof data;
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
        .from("playlist_comment_likes")
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

    const comments: PlaylistComment[] = rows.map((r) => {
      const id = Number(r.id);
      return {
        id,
        playlist_id: String(r.playlist_id),
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

export async function createPlaylistComment(
  supabase: SupabaseClient,
  playlistId: string,
  bodyRaw: string,
  parentId?: number | null,
): Promise<
  | {
      ok: true;
      comment: PlaylistComment;
      notified: "owner" | "parent" | "none";
    }
  | {
      ok: false;
      error: string;
      code?:
        | "not_authenticated"
        | "missing_table"
        | "invalid_body"
        | "playlist_not_found"
        | "parent_not_found"
        | "blocked"
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

  const body = normalizePlaylistCommentBody(bodyRaw);
  if (!body) {
    return {
      ok: false,
      error: `Comment must be 1–${MAX_BODY} characters`,
      code: "invalid_body",
    };
  }

  const { data: pl, error: plError } = await supabase
    .from("playlists")
    .select("id, user_id, is_public")
    .eq("id", playlistId)
    .maybeSingle();

  if (plError) {
    if (isMissingRelation(plError.message)) {
      return {
        ok: false,
        error: "Run playlists SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: plError.message, code: "failed" };
  }
  if (!pl) {
    return {
      ok: false,
      error: "Playlist not found",
      code: "playlist_not_found",
    };
  }

  const ownerId = pl.user_id as string;
  const isPublic = pl.is_public === true;
  if (!isPublic && ownerId !== user.id) {
    const { data: isCollab, error: collabErr } = await supabase.rpc(
      "is_accepted_playlist_collaborator",
      { p_playlist_id: playlistId, p_user_id: user.id },
    );
    if (collabErr && !isMissingRelation(collabErr.message)) {
      return { ok: false, error: collabErr.message, code: "failed" };
    }
    if (isCollab !== true) {
      return {
        ok: false,
        error: "Comments are open on public mixes (or if you’re a collaborator)",
        code: "playlist_not_found",
      };
    }
  }

  if (ownerId && ownerId !== user.id) {
    try {
      const { data: blocked } = await supabase.rpc("users_are_blocked", {
        p_a: user.id,
        p_b: ownerId,
      });
      if (blocked === true) {
        return {
          ok: false,
          error: "You can’t comment on this playlist",
          code: "blocked",
        };
      }
    } catch {
      // blocks optional
    }
  }

  let resolvedParent: number | null = null;
  if (parentId != null && Number.isFinite(parentId)) {
    const { data: parent, error: parentError } = await supabase
      .from("playlist_comments")
      .select("id, playlist_id, parent_id, user_id")
      .eq("id", parentId)
      .maybeSingle();

    if (parentError) {
      if (isMissingColumn(parentError.message)) {
        return {
          ok: false,
          error: "Run playlist comment replies SQL in Supabase first",
          code: "missing_table",
        };
      }
      return { ok: false, error: parentError.message, code: "failed" };
    }
    if (!parent || String(parent.playlist_id) !== playlistId) {
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
            code: "blocked",
          };
        }
      } catch {
        // allow
      }
    }

    const nestedParent = (parent as { parent_id?: number | null }).parent_id;
    resolvedParent =
      nestedParent != null ? Number(nestedParent) : Number(parent.id);
  }

  const insertRow: Record<string, unknown> = {
    playlist_id: playlistId,
    user_id: user.id,
    body,
  };
  if (resolvedParent != null) {
    insertRow.parent_id = resolvedParent;
  }

  let { data, error } = await supabase
    .from("playlist_comments")
    .insert(insertRow)
    .select("id, playlist_id, user_id, body, created_at, parent_id")
    .maybeSingle();

  if (error && resolvedParent != null && isMissingColumn(error.message)) {
    return {
      ok: false,
      error: "Run playlist comment replies SQL in Supabase first",
      code: "missing_table",
    };
  }

  if (error && isMissingColumn(error.message)) {
    const lean = await supabase
      .from("playlist_comments")
      .insert({
        playlist_id: playlistId,
        user_id: user.id,
        body,
      })
      .select("id, playlist_id, user_id, body, created_at")
      .maybeSingle();
    data = lean.data ? { ...lean.data, parent_id: null } : null;
    error = lean.error;
  }

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run playlist comments SQL in Supabase first",
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

  const parentResolved =
    (data as { parent_id?: number | null }).parent_id != null
      ? Number((data as { parent_id: number }).parent_id)
      : resolvedParent;

  return {
    ok: true,
    comment: {
      id: Number(data.id),
      playlist_id: String(data.playlist_id),
      user_id: String(data.user_id),
      body: String(data.body ?? ""),
      created_at: (data.created_at as string | null) ?? null,
      author_name: authorName,
      parent_id: parentResolved,
      like_count: 0,
      liked_by_me: false,
    },
    notified: parentResolved != null ? "parent" : "owner",
  };
}

export async function deletePlaylistComment(
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
    .from("playlist_comments")
    .delete()
    .eq("id", commentId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run playlist comments SQL in Supabase first",
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

export async function togglePlaylistCommentLike(
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

  const { data, error } = await supabase.rpc("toggle_playlist_comment_like", {
    p_comment_id: commentId,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run playlist comment likes SQL in Supabase first",
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

export type OwnerRecentPlaylistComment = {
  id: number;
  user_id: string;
  display_name: string;
  body: string;
  playlist_id: string;
  playlist_title: string;
  created_at: string | null;
  parent_id: number | null;
};

export type OwnerRecentPlaylistCommentsResult = {
  comments: OwnerRecentPlaylistComment[];
  missingTable: boolean;
  error: string | null;
};

/**
 * Recent comments across mixes the user owns (studio roster).
 */
export async function loadOwnerRecentPlaylistComments(
  supabase: SupabaseClient,
  ownerId: string,
  limit = 24,
): Promise<OwnerRecentPlaylistCommentsResult> {
  try {
    const { data: playlists, error: playlistError } = await supabase
      .from("playlists")
      .select("id, name")
      .eq("user_id", ownerId)
      .limit(200);

    if (playlistError) {
      if (isMissingRelation(playlistError.message)) {
        return { comments: [], missingTable: true, error: null };
      }
      return {
        comments: [],
        missingTable: false,
        error: playlistError.message,
      };
    }

    const playlistRows = (playlists ?? []).filter((p) => p.id);
    if (playlistRows.length === 0) {
      return { comments: [], missingTable: false, error: null };
    }

    const titleById = new Map(
      playlistRows.map((p) => [
        p.id as string,
        typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Mix",
      ]),
    );
    const playlistIds = playlistRows.map((p) => p.id as string);

    let { data: rows, error } = await supabase
      .from("playlist_comments")
      .select("id, playlist_id, user_id, body, created_at, parent_id")
      .in("playlist_id", playlistIds)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error && isMissingColumn(error.message)) {
      const lean = await supabase
        .from("playlist_comments")
        .select("id, playlist_id, user_id, body, created_at")
        .in("playlist_id", playlistIds)
        .order("created_at", { ascending: false })
        .limit(limit);
      rows = lean.data as typeof rows;
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

    const comments: OwnerRecentPlaylistComment[] = [];
    for (const r of commentRows) {
      const id = Number(r.id);
      const uid = String(r.user_id ?? "");
      const pid = String(r.playlist_id ?? "");
      if (!Number.isFinite(id) || !uid || !pid) continue;
      const body = String(r.body ?? "").trim();
      if (!body) continue;
      comments.push({
        id,
        user_id: uid,
        display_name: nameById.get(uid) ?? "Listener",
        body: body.length > 160 ? `${body.slice(0, 157)}…` : body,
        playlist_id: pid,
        playlist_title: titleById.get(pid) ?? "Mix",
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
      e instanceof Error ? e.message : "Failed to load mix comments";
    return {
      comments: [],
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

