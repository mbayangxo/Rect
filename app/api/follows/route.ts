import { NextResponse } from "next/server";
import {
  clearAllFollows,
  loadIsFollowing,
  toggleArtistFollow,
} from "@/lib/dashboard/follows";
import { notifyArtist } from "@/lib/dashboard/notifications";
import { createClient } from "@/lib/supabase/server";

type Body = { artist_id?: string };

export async function GET(request: Request) {
  const artistId = new URL(request.url).searchParams.get("artist_id")?.trim();
  if (!artistId) {
    return NextResponse.json(
      { error: "artist_id is required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({
      following: false,
      authenticated: false,
      artist_id: artistId,
      self: false,
    });
  }

  if (user.id === artistId) {
    return NextResponse.json({
      following: false,
      authenticated: true,
      artist_id: artistId,
      self: true,
    });
  }

  const result = await loadIsFollowing(supabase, user.id, artistId);
  if (result.missingTable) {
    return NextResponse.json(
      { error: "Follows not set up", code: "missing_table" },
      { status: 503 },
    );
  }

  return NextResponse.json({
    following: result.following,
    authenticated: true,
    artist_id: artistId,
    self: false,
  });
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const artistId = body.artist_id?.trim();
  if (!artistId) {
    return NextResponse.json(
      { error: "artist_id is required" },
      { status: 400 },
    );
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

  if (user.id === artistId) {
    return NextResponse.json(
      { error: "You can’t follow yourself", code: "cannot_follow_self" },
      { status: 400 },
    );
  }

  const { data: artist } = await supabase
    .from("users")
    .select("id, account_type, role")
    .eq("id", artistId)
    .maybeSingle();

  if (!artist) {
    return NextResponse.json({ error: "Artist not found" }, { status: 404 });
  }

  const isArtist =
    artist.account_type === "artist" || artist.role === "artist";
  if (!isArtist) {
    return NextResponse.json({ error: "Not an artist" }, { status: 400 });
  }

  const result = await toggleArtistFollow(supabase, artistId);
  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "missing_table"
          ? 503
          : result.code === "cannot_follow_self"
            ? 400
            : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  if (result.following) {
    await notifyArtist(supabase, artistId, "follow");
  }

  return NextResponse.json({
    ok: true,
    following: result.following,
    artist_id: result.artist_id,
    follower_count: result.follower_count,
  });
}

/** Unfollow every artist for the signed-in user. */
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

  const result = await clearAllFollows(supabase, user.id);
  if (!result.ok) {
    const status = result.code === "missing_table" ? 503 : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({ ok: true, deleted: result.deleted });
}
