import { NextResponse } from "next/server";
import {
  createPlaylistComment,
  deletePlaylistComment,
  loadPlaylistComments,
} from "@/lib/dashboard/playlist-comments";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type Body = { body?: string; comment_id?: number; parent_id?: number };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const playlistId = id?.trim();
  if (!playlistId) {
    return NextResponse.json({ error: "Playlist id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const result = await loadPlaylistComments(supabase, playlistId, {
    viewerId: user?.id ?? null,
  });
  if (result.missingTable) {
    return NextResponse.json(
      { error: "Comments not set up", code: "missing_table", comments: [] },
      { status: 503 },
    );
  }
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    comments: result.comments,
    likesReady: result.likesReady,
  });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const playlistId = id?.trim();
  if (!playlistId) {
    return NextResponse.json({ error: "Playlist id required" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parentId =
    typeof body.parent_id === "number" && Number.isFinite(body.parent_id)
      ? body.parent_id
      : null;

  const supabase = await createClient();
  const result = await createPlaylistComment(
    supabase,
    playlistId,
    typeof body.body === "string" ? body.body : "",
    parentId,
  );

  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "missing_table"
          ? 503
          : result.code === "invalid_body" ||
              result.code === "playlist_not_found" ||
              result.code === "parent_not_found" ||
              result.code === "blocked"
            ? 400
            : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  if (result.notified === "parent" && result.comment.parent_id != null) {
    const args: {
      p_parent_comment_id: number;
      p_reply_preview: string;
      p_reply_comment_id?: number;
    } = {
      p_parent_comment_id: result.comment.parent_id,
      p_reply_preview: result.comment.body,
      p_reply_comment_id: result.comment.id,
    };
    let { error } = await supabase.rpc("notify_playlist_comment_reply", args);
    if (
      error &&
      /p_reply_comment_id|Could not find the function|PGRST202/i.test(
        error.message,
      )
    ) {
      const fallback = await supabase.rpc("notify_playlist_comment_reply", {
        p_parent_comment_id: result.comment.parent_id,
        p_reply_preview: result.comment.body,
      });
      error = fallback.error;
    }
    void error;
  } else if (result.notified === "owner") {
    const args: {
      p_playlist_id: string;
      p_comment_preview: string;
      p_comment_id?: number;
    } = {
      p_playlist_id: playlistId,
      p_comment_preview: result.comment.body,
      p_comment_id: result.comment.id,
    };
    let { error } = await supabase.rpc("notify_playlist_comment", args);
    if (
      error &&
      /p_comment_id|Could not find the function|PGRST202/i.test(error.message)
    ) {
      const fallback = await supabase.rpc("notify_playlist_comment", {
        p_playlist_id: playlistId,
        p_comment_preview: result.comment.body,
      });
      error = fallback.error;
    }
    void error;
  }

  return NextResponse.json({ ok: true, comment: result.comment });
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const playlistId = id?.trim();
  if (!playlistId) {
    return NextResponse.json({ error: "Playlist id required" }, { status: 400 });
  }

  let commentId: number | null = null;
  const q = new URL(request.url).searchParams.get("comment_id");
  if (q && Number.isFinite(Number(q))) {
    commentId = Number(q);
  } else {
    try {
      const body = (await request.json()) as Body;
      if (typeof body.comment_id === "number" && Number.isFinite(body.comment_id)) {
        commentId = body.comment_id;
      }
    } catch {
      // empty
    }
  }

  if (commentId == null) {
    return NextResponse.json(
      { error: "comment_id required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const result = await deletePlaylistComment(supabase, commentId);
  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "missing_table"
          ? 503
          : result.code === "not_found"
            ? 404
            : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({ ok: true, playlist_id: playlistId });
}
