import { NextResponse } from "next/server";
import {
  endLiveRoom,
  loadArtistLiveRoomSession,
  loadPublicLiveNow,
  startLiveRoom,
  type LiveRoomMode,
  type LiveRoomVisibility,
} from "@/lib/dashboard/live-rooms";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") || "now";
  const supabase = await createClient();

  if (scope === "mine") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    const result = await loadArtistLiveRoomSession(supabase, user.id);
    if (result.missingTable) {
      return NextResponse.json(
        { error: "Run live rooms SQL", code: "missing_table", room: null },
        { status: 503 },
      );
    }
    return NextResponse.json({ room: result.room, error: result.error });
  }

  const result = await loadPublicLiveNow(supabase);
  if (result.missingTable) {
    return NextResponse.json(
      { error: null, code: "missing_table", rooms: [] },
      { status: 200 },
    );
  }
  return NextResponse.json({ rooms: result.rooms, error: result.error });
}

type StartBody = {
  title?: string;
  mode?: string;
  visibility?: string;
  country?: string;
  city?: string;
  neighborhood?: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("account_type, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!isArtistAccount(profile, user)) {
    return NextResponse.json({ error: "Artists only" }, { status: 403 });
  }

  let body: StartBody;
  try {
    body = (await request.json()) as StartBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mode = (body.mode || "video") as LiveRoomMode;
  const visibility = (body.visibility || "public") as LiveRoomVisibility;
  if (!["video", "photos", "audio"].includes(mode)) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }
  if (!["public", "fan_club", "private"].includes(visibility)) {
    return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
  }

  const result = await startLiveRoom(supabase, {
    title: typeof body.title === "string" ? body.title : "Live Room",
    mode,
    visibility,
    country: body.country,
    city: body.city,
    neighborhood: body.neighborhood,
  });

  if (!result.ok) {
    const status =
      result.code === "missing_table"
        ? 503
        : result.code === "not_authenticated"
          ? 401
          : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    live_room_id: result.live_room_id,
    skipped: result.skipped ?? null,
  });
}

type EndBody = { live_room_id?: string };

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: EndBody;
  try {
    body = (await request.json()) as EndBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = body.live_room_id?.trim();
  if (!id) {
    return NextResponse.json({ error: "live_room_id required" }, { status: 400 });
  }

  const result = await endLiveRoom(supabase, id);
  if (!result.ok) {
    const status =
      result.code === "missing_table"
        ? 503
        : result.code === "not_owner"
          ? 403
          : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }
  return NextResponse.json({ ok: true });
}
