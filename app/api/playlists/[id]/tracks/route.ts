import { NextResponse } from "next/server";
import {
  addTrackToPlaylist,
  movePlaylistTrack,
  removeTrackFromPlaylist,
  reorderPlaylistTracks,
} from "@/lib/dashboard/playlists";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };
type Body = {
  track_id?: string;
  track_ids?: string[];
  direction?: "up" | "down";
};

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const playlistId = id?.trim();
  if (!playlistId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const trackId = body.track_id?.trim();
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
    return NextResponse.json(
      { error: "Sign in required", authenticated: false },
      { status: 401 },
    );
  }

  const { data: track } = await supabase
    .from("tracks")
    .select("id")
    .eq("id", trackId)
    .maybeSingle();
  if (!track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const result = await addTrackToPlaylist(
    supabase,
    user.id,
    playlistId,
    trackId,
  );
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

  return NextResponse.json({
    ok: true,
    added: result.added,
    track_id: trackId,
    playlist_id: playlistId,
  });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const playlistId = id?.trim();
  if (!playlistId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

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

  const direction =
    body.direction === "up" || body.direction === "down"
      ? body.direction
      : null;
  const moveTrackId = body.track_id?.trim();

  if (moveTrackId && direction) {
    const result = await movePlaylistTrack(
      supabase,
      user.id,
      playlistId,
      moveTrackId,
      direction,
    );
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
    return NextResponse.json({
      ok: true,
      track_ids: result.track_ids,
      playlist_id: playlistId,
    });
  }

  const trackIds = Array.isArray(body.track_ids) ? body.track_ids : null;
  if (!trackIds || trackIds.length === 0) {
    return NextResponse.json(
      { error: "track_id+direction or track_ids required" },
      { status: 400 },
    );
  }

  const result = await reorderPlaylistTracks(
    supabase,
    user.id,
    playlistId,
    trackIds,
  );
  if (!result.ok) {
    const status =
      result.code === "missing_table"
        ? 503
        : result.code === "not_found"
          ? 404
          : result.error.includes("track_ids")
            ? 400
            : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    track_ids: result.track_ids,
    playlist_id: playlistId,
  });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const playlistId = id?.trim();
  if (!playlistId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const trackId = body.track_id?.trim();
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
    return NextResponse.json(
      { error: "Sign in required", authenticated: false },
      { status: 401 },
    );
  }

  const result = await removeTrackFromPlaylist(
    supabase,
    user.id,
    playlistId,
    trackId,
  );
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

  return NextResponse.json({
    ok: true,
    track_id: trackId,
    playlist_id: playlistId,
  });
}
