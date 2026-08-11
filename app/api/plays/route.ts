import { NextResponse } from "next/server";
import {
  consumePlayCredit,
  loadPlayCreditBalance,
} from "@/lib/dashboard/credits";
import { notifyTrackListen } from "@/lib/dashboard/notifications";
import { createRouteClient } from "@/lib/supabase/route";

type Body = { track_id?: string };

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const trackId = body.track_id?.trim();
  if (!trackId) {
    return NextResponse.json({ error: "track_id is required" }, { status: 400 });
  }

  const supabase = await createRouteClient(request);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "Sign in required to record plays.", authenticated: false },
      { status: 401 },
    );
  }

  // Confirm track exists (public read)
  const { data: track, error: trackError } = await supabase
    .from("tracks")
    .select("id, artist_id")
    .eq("id", trackId)
    .maybeSingle();

  if (trackError || !track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  // Artists checking their own mix — no credit burn, no chart play.
  if (track.artist_id && track.artist_id === user.id) {
    const balance = await loadPlayCreditBalance(supabase);
    return NextResponse.json({
      ok: true,
      play_id: null,
      own_play: true,
      credits_remaining: balance.credits,
    });
  }

  // Ensure starter balance exists, then consume one credit
  await loadPlayCreditBalance(supabase);
  const consumed = await consumePlayCredit(supabase);
  if (!consumed.ok) {
    if (consumed.code === "insufficient") {
      return NextResponse.json(
        {
          error: consumed.error,
          code: "insufficient_credits",
          authenticated: true,
        },
        { status: 402 },
      );
    }
    return NextResponse.json(
      { error: consumed.error, code: consumed.code },
      { status: consumed.code === "missing_table" ? 503 : 500 },
    );
  }

  const row = { track_id: trackId, listener_id: user.id };

  const { data, error } = await supabase
    .from("plays")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) {
    const missing = /relation .* does not exist|Could not find the table|PGRST205|policy/i.test(
      error.message,
    );
    return NextResponse.json(
      {
        error: missing
          ? `Plays insert failed (check plays RLS migration): ${error.message}`
          : error.message,
        code: missing ? "plays_insert_failed" : "plays_error",
      },
      { status: 500 },
    );
  }

  const playId = data?.id != null ? String(data.id) : null;
  await notifyTrackListen(supabase, trackId, playId);

  return NextResponse.json({
    ok: true,
    play_id: playId,
    credits_remaining: consumed.balance,
  });
}
