import { NextResponse } from "next/server";
import { notifyTrackRelease } from "@/lib/dashboard/notifications";
import { createClient } from "@/lib/supabase/server";
import {
  isPublishedTrack,
  trackStatusForWrite,
  TRACK_STATUS_LIVE,
  TRACK_STATUS_PENDING,
} from "@/lib/tracks";

export const dynamic = "force-dynamic";

type Body = { status?: string };
type Params = { params: Promise<{ id: string }> };

const ALLOWED_INTENTS = new Set([
  "pending",
  "published",
  "live",
  "draft",
  "unpublished",
]);

/** Artist toggles own track between draft (pending) and live catalog. */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const trackId = id?.trim();
  if (!trackId) {
    return NextResponse.json({ error: "Track id required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const intent = (body.status || "").trim().toLowerCase();
  if (!ALLOWED_INTENTS.has(intent)) {
    return NextResponse.json(
      { error: "Status must be pending or live/published." },
      { status: 400 },
    );
  }

  const status = trackStatusForWrite(intent);

  const { data: existing, error: findError } = await supabase
    .from("tracks")
    .select("id, artist_id, status, title")
    .eq("id", trackId)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Track not found." }, { status: 404 });
  }
  if (existing.artist_id !== user.id) {
    return NextResponse.json({ error: "Not your track." }, { status: 403 });
  }

  const wasPublished = isPublishedTrack(existing);

  let data: { id: string; title: string | null; status: string | null; artist_id: string | null } | null =
    null;
  let error: { message: string } | null = null;

  // Prefer DB-canonical `live`; fall back to `published` if an older check allows only that.
  const writeOrder =
    status === TRACK_STATUS_LIVE
      ? [TRACK_STATUS_LIVE, "published"]
      : [TRACK_STATUS_PENDING];

  for (const writeStatus of writeOrder) {
    const result = await supabase
      .from("tracks")
      .update({ status: writeStatus })
      .eq("id", trackId)
      .eq("artist_id", user.id)
      .select("id, title, status, artist_id")
      .maybeSingle();
    data = result.data;
    error = result.error;
    if (!error && data) break;
    if (error && !/tracks_status_check/i.test(error.message)) break;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let notified = 0;
  if (status === TRACK_STATUS_LIVE && !wasPublished) {
    const release = await notifyTrackRelease(supabase, trackId);
    notified = release.notified;
  }

  return NextResponse.json({ ok: true, track: data, notified });
}
