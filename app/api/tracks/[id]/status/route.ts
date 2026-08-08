import { NextResponse } from "next/server";
import { notifyTrackRelease } from "@/lib/dashboard/notifications";
import { createClient } from "@/lib/supabase/server";
import { isPublishedTrack } from "@/lib/tracks";

export const dynamic = "force-dynamic";

type Body = { status?: string };
type Params = { params: Promise<{ id: string }> };

const ALLOWED = new Set(["pending", "published"]);

/** Artist toggles own track between pending and published. */
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

  const status = (body.status || "").trim().toLowerCase();
  if (!ALLOWED.has(status)) {
    return NextResponse.json(
      { error: "Status must be pending or published." },
      { status: 400 },
    );
  }

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

  const { data, error } = await supabase
    .from("tracks")
    .update({ status })
    .eq("id", trackId)
    .eq("artist_id", user.id)
    .select("id, title, status, artist_id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let notified = 0;
  if (status === "published" && !wasPublished) {
    const release = await notifyTrackRelease(supabase, trackId);
    notified = release.notified;
  }

  return NextResponse.json({ ok: true, track: data, notified });
}
