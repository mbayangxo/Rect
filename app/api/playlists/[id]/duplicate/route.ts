import { NextResponse } from "next/server";
import { duplicatePlaylist } from "@/lib/dashboard/playlists";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
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

  const result = await duplicatePlaylist(supabase, user.id, playlistId);
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

  return NextResponse.json({ ok: true, playlist: result.playlist });
}
