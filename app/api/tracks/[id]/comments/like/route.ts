import { NextResponse } from "next/server";
import { toggleCommentLike } from "@/lib/dashboard/comments";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type Body = { comment_id?: number };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const trackId = id?.trim();
  if (!trackId) {
    return NextResponse.json({ error: "Track id required." }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const commentId =
    typeof body.comment_id === "number" && Number.isFinite(body.comment_id)
      ? body.comment_id
      : null;
  if (commentId == null || commentId <= 0) {
    return NextResponse.json(
      { error: "comment_id required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const result = await toggleCommentLike(supabase, commentId);
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
    track_id: trackId,
    comment_id: result.comment_id,
    liked: result.liked,
    like_count: result.like_count,
  });
}
