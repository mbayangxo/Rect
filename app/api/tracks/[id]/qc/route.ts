import { NextResponse } from "next/server";
import {
  analyzeAudioBuffer,
  formatQcSummary,
  qcFieldsForDb,
} from "@/lib/audio/qc";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import { createRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Re-run Upload QC on an existing track audio URL. */
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

  const { data: track, error } = await supabase
    .from("tracks")
    .select("id, artist_id, audio_url")
    .eq("id", trackId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!track || track.artist_id !== current.user.id) {
    return NextResponse.json({ error: "Track not found." }, { status: 404 });
  }
  if (!track.audio_url || typeof track.audio_url !== "string") {
    return NextResponse.json({ error: "No audio on this track." }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    const res = await fetch(track.audio_url);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Could not download audio (${res.status}).` },
        { status: 502 },
      );
    }
    buffer = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Download failed." },
      { status: 502 },
    );
  }

  const ext =
    track.audio_url.split(".").pop()?.split("?")[0]?.slice(0, 5) || "mp3";
  const qc = await analyzeAudioBuffer(buffer, ext);
  const fields = qcFieldsForDb(qc);

  const { data: updated, error: upErr } = await supabase
    .from("tracks")
    .update(fields)
    .eq("id", trackId)
    .eq("artist_id", current.user.id)
    .select(
      "id, qc_status, qc_lufs_integrated, qc_true_peak_dbtp, qc_silence_ratio, qc_issues",
    )
    .maybeSingle();

  if (upErr) {
    if (/qc_status|column .* does not exist/i.test(upErr.message)) {
      return NextResponse.json(
        {
          error: "Run 20260903_track_audio_qc.sql in Supabase.",
          code: "missing_qc_columns",
          qc: {
            status: qc.status,
            summary: formatQcSummary(qc),
            issues: qc.issues,
          },
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    track: updated,
    qc: {
      status: qc.status,
      lufs_integrated: qc.lufs_integrated,
      true_peak_dbtp: qc.true_peak_dbtp,
      silence_ratio: qc.silence_ratio,
      issues: qc.issues,
      summary: formatQcSummary(qc),
    },
  });
}
