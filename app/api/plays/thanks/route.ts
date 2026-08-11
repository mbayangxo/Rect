import { NextResponse } from "next/server";
import { sendPlayThanks } from "@/lib/dashboard/play-thanks";
import { createClient } from "@/lib/supabase/server";

type Body = { play_id?: string; message?: string };

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const playId = typeof body.play_id === "string" ? body.play_id.trim() : "";
  if (!playId) {
    return NextResponse.json({ error: "play_id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const result = await sendPlayThanks(
    supabase,
    playId,
    typeof body.message === "string" ? body.message : "",
  );

  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "missing_table"
          ? 503
          : result.code === "play_not_found"
            ? 404
            : result.code === "cannot_thank_self" ||
                result.code === "not_following" ||
                result.code === "privacy" ||
                result.code === "blocked" ||
                result.code === "invalid_message" ||
                result.code === "play_required"
              ? 400
              : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    play_id: result.play_id,
    thanks_message: result.thanks_message,
    skipped: result.skipped ?? null,
  });
}
