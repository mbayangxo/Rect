import { NextResponse } from "next/server";
import {
  clearListeningJournal,
  deleteListeningPlay,
  dismissContinueTrack,
} from "@/lib/dashboard/listening-journal";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Body = { play_id?: string; track_id?: string };

/**
 * DELETE with no body → clear all own plays.
 * DELETE with { play_id } → remove one journal entry.
 * DELETE with { track_id } → remove all plays for that track (Continue dismiss).
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in required", authenticated: false },
      { status: 401 },
    );
  }

  let body: Body = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text) as Body;
    }
  } catch {
    body = {};
  }

  const playId = body.play_id?.trim();
  if (playId) {
    const result = await deleteListeningPlay(supabase, user.id, playId);
    if (!result.ok) {
      const status =
        result.code === "missing_table"
          ? 503
          : result.code === "not_found"
            ? 404
            : 500;
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status },
      );
    }
    return NextResponse.json({ ok: true, play_id: playId });
  }

  const trackId = body.track_id?.trim();
  if (trackId) {
    const result = await dismissContinueTrack(supabase, user.id, trackId);
    if (!result.ok) {
      const status = result.code === "missing_table" ? 503 : 500;
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status },
      );
    }
    return NextResponse.json({
      ok: true,
      track_id: trackId,
      deleted: result.deleted,
    });
  }

  const result = await clearListeningJournal(supabase, user.id);
  if (!result.ok) {
    const status = result.code === "missing_table" ? 503 : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({ ok: true, deleted: result.deleted });
}
