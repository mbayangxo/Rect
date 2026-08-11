import { NextResponse } from "next/server";
import {
  createTrackComment,
  deleteTrackComment,
  loadTrackComments,
} from "@/lib/dashboard/comments";
import {
  notifyCommentReply,
  notifyTrackComment,
} from "@/lib/dashboard/notifications";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type Body = {
  body?: string;
  comment_id?: number;
  parent_id?: number;
};

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const trackId = id?.trim();
  if (!trackId) {
    return NextResponse.json({ error: "Track id required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const result = await loadTrackComments(supabase, trackId, {
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

  return NextResponse.json({ comments: result.comments });
}

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

  const parentId =
    typeof body.parent_id === "number" && Number.isFinite(body.parent_id)
      ? body.parent_id
      : null;

  const supabase = await createClient();
  const result = await createTrackComment(
    supabase,
    trackId,
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
              result.code === "not_published" ||
              result.code === "track_not_found" ||
              result.code === "parent_not_found"
            ? 400
            : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  if (result.notified === "parent" && result.comment.parent_id != null) {
    await notifyCommentReply(
      supabase,
      result.comment.parent_id,
      result.comment.body,
      result.comment.id,
    );
  } else if (result.notified === "artist") {
    await notifyTrackComment(
      supabase,
      trackId,
      result.comment.body,
      result.comment.id,
    );
  }

  return NextResponse.json({ ok: true, comment: result.comment });
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const trackId = id?.trim();
  if (!trackId) {
    return NextResponse.json({ error: "Track id required." }, { status: 400 });
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
      { error: "comment_id required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const result = await deleteTrackComment(supabase, commentId);
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

  return NextResponse.json({ ok: true, track_id: trackId });
}
