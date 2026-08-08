import { NextResponse } from "next/server";
import {
  createPlaylist,
  createPlaylistFromTrackIds,
  loadUserPlaylists,
} from "@/lib/dashboard/playlists";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
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

  const result = await loadUserPlaylists(supabase, user.id);
  if (result.missingTable) {
    return NextResponse.json(
      {
        error: "Run playlists SQL in Supabase first",
        code: "missing_table",
        playlists: [],
      },
      { status: 503 },
    );
  }
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ playlists: result.playlists });
}

export async function POST(request: Request) {
  let body: { name?: string; track_ids?: unknown };
  try {
    body = (await request.json()) as { name?: string; track_ids?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const trackIds = Array.isArray(body.track_ids)
    ? body.track_ids.filter((id): id is string => typeof id === "string")
    : [];

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

  if (trackIds.length > 0) {
    const result = await createPlaylistFromTrackIds(
      supabase,
      user.id,
      name,
      trackIds,
    );
    if (!result.ok) {
      const status = result.code === "missing_table" ? 503 : 500;
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status },
      );
    }
    return NextResponse.json({ ok: true, playlist: result.playlist });
  }

  const result = await createPlaylist(supabase, user.id, name);
  if (!result.ok) {
    const status = result.code === "missing_table" ? 503 : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({ ok: true, playlist: result.playlist });
}
