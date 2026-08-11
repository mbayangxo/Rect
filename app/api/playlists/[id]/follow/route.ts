import { NextResponse } from "next/server";
import {
  loadIsFollowingPlaylist,
  loadPlaylistFollowerCount,
  notifyPlaylistFollow,
  togglePlaylistFollow,
} from "@/lib/dashboard/playlist-follows";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const playlistId = id?.trim();
  if (!playlistId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const countRes = await loadPlaylistFollowerCount(supabase, playlistId);
  if (countRes.missingTable) {
    return NextResponse.json(
      { error: "Playlist follows not set up", code: "missing_table" },
      { status: 503 },
    );
  }

  let following = false;
  if (user) {
    const followRes = await loadIsFollowingPlaylist(
      supabase,
      user.id,
      playlistId,
    );
    following = followRes.following;
  }

  return NextResponse.json({
    following,
    follower_count: countRes.count,
    authenticated: Boolean(user),
  });
}

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const playlistId = id?.trim();
  if (!playlistId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
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

  const result = await togglePlaylistFollow(supabase, playlistId);
  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "missing_table"
          ? 503
          : result.code === "blocked"
            ? 403
            : result.code === "cannot_follow_own" ||
                result.code === "playlist_private"
              ? 400
              : result.code === "playlist_not_found"
                ? 404
                : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  if (result.following) {
    await notifyPlaylistFollow(supabase, playlistId);
  }

  return NextResponse.json({
    ok: true,
    following: result.following,
    playlist_id: result.playlist_id,
    follower_count: result.follower_count,
  });
}
