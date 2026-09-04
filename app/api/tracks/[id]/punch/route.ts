import { NextResponse } from "next/server";
import { qcBlocksGoLive } from "@/lib/audio/qc";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { createRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * RECT Punch — request signature mastering after Upload QC.
 * Demo queue: marks requested; partner rail fills punch_audio_url later.
 * When ready, Delivery/Taali should prefer punch_audio_url.
 */
export async function POST(request: Request, { params }: Params) {
  const { id: trackId } = await params;
  const supabase = await createRouteClient(request);
  const current = await getDashboardCurrentUser(supabase);
  if (!current.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!isArtistAccount(current.profile, current.user)) {
    return NextResponse.json({ error: "Artist account required." }, { status: 403 });
  }

  let body: { action?: string } = {};
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    /* empty body ok */
  }
  const action = body.action ?? "request";

  const { data: track, error } = await supabase
    .from("tracks")
    .select(
      "id, artist_id, audio_url, qc_status, punch_status, punch_audio_url, content_kind",
    )
    .eq("id", trackId)
    .maybeSingle();

  if (error) {
    if (/punch_status|qc_status|content_kind|column .* does not exist/i.test(error.message)) {
      return NextResponse.json(
        {
          error: "Run 20260904_hearing_aids_and_punch.sql (and QC migration).",
          code: "missing_columns",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!track || track.artist_id !== current.user.id) {
    return NextResponse.json({ error: "Track not found." }, { status: 404 });
  }
  if ((track.content_kind || "music") === "podcast") {
    return NextResponse.json(
      { error: "RECT Punch is for music masters, not Hearing Aids episodes." },
      { status: 400 },
    );
  }
  if (qcBlocksGoLive(track.qc_status as string | null)) {
    return NextResponse.json(
      { error: "Pass Upload QC before requesting RECT Punch." },
      { status: 400 },
    );
  }

  if (action === "cancel") {
    const { data, error: upErr } = await supabase
      .from("tracks")
      .update({
        punch_status: "skipped",
        punch_notes: "Punch cancelled by artist.",
      })
      .eq("id", trackId)
      .eq("artist_id", current.user.id)
      .select("id, punch_status, punch_audio_url, punch_notes")
      .maybeSingle();
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, track: data });
  }

  // Demo: immediately mark processing then ready with original URL as placeholder
  // until a real Punch partner rewrites the master. Never invent a fake DSP file.
  const now = new Date().toISOString();
  const { data, error: upErr } = await supabase
    .from("tracks")
    .update({
      punch_status: "requested",
      punch_requested_at: now,
      punch_notes:
        "Queued for RECT Punch. Partner mastering fills punch_audio_url when ready — Delivery uses that master for Taali.",
    })
    .eq("id", trackId)
    .eq("artist_id", current.user.id)
    .select(
      "id, punch_status, punch_audio_url, punch_requested_at, punch_notes",
    )
    .maybeSingle();

  if (upErr) {
    if (/punch_status|column .* does not exist/i.test(upErr.message)) {
      return NextResponse.json(
        {
          error: "Run 20260904_hearing_aids_and_punch.sql in Supabase.",
          code: "missing_columns",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, track: data });
}
