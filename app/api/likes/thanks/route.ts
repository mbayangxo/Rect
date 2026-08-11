import { NextResponse } from "next/server";
import { sendLikeThanks } from "@/lib/dashboard/like-thanks";
import { createClient } from "@/lib/supabase/server";

type Body = { liker_id?: string; track_id?: string; message?: string };

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const likerId = typeof body.liker_id === "string" ? body.liker_id.trim() : "";
  const trackId = typeof body.track_id === "string" ? body.track_id.trim() : "";
  if (!likerId || !trackId) {
    return NextResponse.json(
      { error: "liker_id and track_id are required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const result = await sendLikeThanks(
    supabase,
    likerId,
    trackId,
    typeof body.message === "string" ? body.message : "",
  );

  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "missing_table"
          ? 503
          : result.code === "like_not_found"
            ? 404
            : result.code === "cannot_thank_self" ||
                result.code === "not_following" ||
                result.code === "privacy" ||
                result.code === "blocked" ||
                result.code === "invalid_message" ||
                result.code === "liker_required" ||
                result.code === "track_required"
              ? 400
              : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    liker_id: result.liker_id,
    track_id: result.track_id,
    thanks_message: result.thanks_message,
    skipped: result.skipped ?? null,
  });
}
