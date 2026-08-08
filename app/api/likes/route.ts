import { NextResponse } from "next/server";
import {
  clearAllLikes,
  isTrackLiked,
  toggleTrackLike,
} from "@/lib/dashboard/likes";
import { createClient } from "@/lib/supabase/server";

type Body = { track_id?: string };

export async function GET(request: Request) {
  const trackId = new URL(request.url).searchParams.get("track_id")?.trim();
  if (!trackId) {
    return NextResponse.json(
      { error: "track_id is required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({
      liked: false,
      authenticated: false,
      track_id: trackId,
    });
  }

  const result = await isTrackLiked(supabase, user.id, trackId);
  if (!result.ok) {
    const status = result.code === "missing_table" ? 503 : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    liked: result.liked,
    authenticated: true,
    track_id: trackId,
  });
}

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

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "Sign in required", authenticated: false },
      { status: 401 },
    );
  }

  // Soft-check track exists
  const { data: track } = await supabase
    .from("tracks")
    .select("id")
    .eq("id", trackId)
    .maybeSingle();
  if (!track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const result = await toggleTrackLike(supabase, trackId);
  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "missing_table"
          ? 503
          : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    liked: result.liked,
    track_id: result.track_id,
  });
}

/** Clear all likes for the signed-in user. */
export async function DELETE() {
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

  const result = await clearAllLikes(supabase, user.id);
  if (!result.ok) {
    const status = result.code === "missing_table" ? 503 : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({ ok: true, deleted: result.deleted });
}
