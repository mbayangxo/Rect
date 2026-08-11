import { NextResponse } from "next/server";
import { sendMixThanks } from "@/lib/dashboard/mix-thanks";
import { createClient } from "@/lib/supabase/server";

type Body = { message?: string };
type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id: playlistId } = await params;
  if (!playlistId?.trim()) {
    return NextResponse.json(
      { error: "playlist_id is required" },
      { status: 400 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createClient();
  const result = await sendMixThanks(
    supabase,
    playlistId,
    typeof body.message === "string" ? body.message : "",
  );

  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "missing_table"
          ? 503
          : result.code === "playlist_not_found"
            ? 404
            : result.code === "cannot_thank_self" ||
                result.code === "not_following" ||
                result.code === "playlist_private" ||
                result.code === "blocked" ||
                result.code === "invalid_message" ||
                result.code === "playlist_required"
              ? 400
              : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    playlist_id: result.playlist_id,
    thanks_message: result.thanks_message,
    skipped: result.skipped ?? null,
  });
}
