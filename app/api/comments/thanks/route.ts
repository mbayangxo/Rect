import { NextResponse } from "next/server";
import { sendCommentThanks } from "@/lib/dashboard/comment-thanks";
import { createClient } from "@/lib/supabase/server";

type Body = { comment_id?: number; message?: string };

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const commentId =
    typeof body.comment_id === "number" && Number.isFinite(body.comment_id)
      ? body.comment_id
      : NaN;

  const supabase = await createClient();
  const result = await sendCommentThanks(
    supabase,
    commentId,
    typeof body.message === "string" ? body.message : "",
  );

  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "missing_table"
          ? 503
          : result.code === "comment_not_found"
            ? 404
            : result.code === "cannot_thank_self" ||
                result.code === "not_track_owner" ||
                result.code === "not_allowed" ||
                result.code === "blocked" ||
                result.code === "invalid_message" ||
                result.code === "comment_required"
              ? 400
              : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    comment_id: result.comment_id,
    thanks_message: result.thanks_message,
    skipped: result.skipped ?? null,
  });
}
