import { NextResponse } from "next/server";
import {
  loadPlayCreditBalance,
  recordCreditedPlay,
} from "@/lib/dashboard/credits";
import { notifyTrackListen } from "@/lib/dashboard/notifications";
import {
  PLAY_EARNING_XOF,
  recordPlayEarning,
} from "@/lib/dashboard/play-earnings";
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

  const { data: track, error: trackError } = await supabase
    .from("tracks")
    .select("id, artist_id")
    .eq("id", trackId)
    .maybeSingle();

  if (trackError || !track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  if (track.artist_id && track.artist_id === user.id) {
    const balance = await loadPlayCreditBalance(supabase);
    return NextResponse.json({
      ok: true,
      play_id: null,
      own_play: true,
      credits_remaining: balance.credits,
    });
  }

  const recorded = await recordCreditedPlay(supabase, trackId);
  if (!recorded.ok) {
    if (recorded.code === "insufficient") {
      return NextResponse.json(
        {
          error: recorded.error,
          code: "insufficient_credits",
          authenticated: true,
        },
        { status: 402 },
      );
    }
    if (recorded.code === "not_authenticated") {
      return NextResponse.json(
        { error: recorded.error, authenticated: false },
        { status: 401 },
      );
    }
    if (recorded.code === "track_not_found") {
      return NextResponse.json({ error: recorded.error }, { status: 404 });
    }
    return NextResponse.json(
      { error: recorded.error, code: recorded.code },
      { status: recorded.code === "missing_table" ? 503 : 500 },
    );
  }

  await notifyTrackListen(supabase, trackId, recorded.play_id);

  let artist_earning_xof: number | null = null;
  let earnings_skipped: string | null = null;
  let earnings_error: string | null = null;
  if (recorded.play_id) {
    const earned = await recordPlayEarning(
      supabase,
      trackId,
      recorded.play_id,
      PLAY_EARNING_XOF,
    );
    if (earned.ok) {
      artist_earning_xof = earned.amount_xof;
      earnings_skipped = earned.skipped ?? null;
    } else {
      earnings_error = earned.error;
    }
  }

  return NextResponse.json({
    ok: true,
    play_id: recorded.play_id,
    credits_remaining: recorded.balance,
    artist_earning_xof,
    earnings_skipped,
    earnings_error,
  });
}
