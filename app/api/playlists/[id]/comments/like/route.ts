import { NextResponse } from "next/server";
import { togglePlaylistCommentLike } from "@/lib/dashboard/playlist-comments";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type Body = { comment_id?: number };

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

  const commentId =
    typeof body.comment_id === "number" && Number.isFinite(body.comment_id)
      ? body.comment_id
      : null;
  if (commentId == null || commentId <= 0) {
    return NextResponse.json(
      { error: "comment_id required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const result = await togglePlaylistCommentLike(supabase, commentId);
  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "missing_table"
          ? 503
          : result.code === "comment_not_found"
            ? 404
            : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    playlist_id: playlistId,
    comment_id: result.comment_id,
    liked: result.liked,
    like_count: result.like_count,
  });
}
