import { NextResponse } from "next/server";
import {
  joinLiveRoom,
  leaveLiveRoom,
  loadLiveRoomById,
  loadLiveRoomMessages,
  loadLiveRoomPhotos,
  pushLiveRoomPhoto,
  sendLiveRoomMessage,
} from "@/lib/dashboard/live-rooms";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const liveRoomId = id?.trim();
  if (!liveRoomId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const roomRes = await loadLiveRoomById(supabase, liveRoomId);
  if (roomRes.missingTable) {
    return NextResponse.json(
      { error: "Run live rooms SQL", code: "missing_table" },
      { status: 503 },
    );
  }
  if (!roomRes.room) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [messages, photos] = await Promise.all([
    loadLiveRoomMessages(supabase, liveRoomId),
    loadLiveRoomPhotos(supabase, liveRoomId),
  ]);

  return NextResponse.json({
    room: roomRes.room,
    messages,
    photos,
  });
}

type Body = {
  action?: string;
  body?: string;
  photo_url?: string;
  caption?: string;
};

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const liveRoomId = id?.trim();
  if (!liveRoomId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  let payload: Body;
  try {
    payload = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = (payload.action || "join").trim();
  const supabase = await createClient();

  if (action === "join") {
    const result = await joinLiveRoom(supabase, liveRoomId);
    if (!result.ok) {
      const status =
        result.code === "not_authenticated"
          ? 401
          : result.code === "fan_club_required" ||
              result.code === "private_room" ||
              result.code === "not_live"
            ? 403
            : result.code === "missing_table"
              ? 503
              : 500;
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status },
      );
    }
    return NextResponse.json(result);
  }

  if (action === "leave") {
    await leaveLiveRoom(supabase, liveRoomId);
    return NextResponse.json({ ok: true });
  }

  if (action === "message") {
    const result = await sendLiveRoomMessage(
      supabase,
      liveRoomId,
      typeof payload.body === "string" ? payload.body : "",
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.code === "not_authenticated" ? 401 : 400 },
      );
    }
    return NextResponse.json({ ok: true, message: result.message });
  }

  if (action === "photo") {
    const url = typeof payload.photo_url === "string" ? payload.photo_url.trim() : "";
    if (!url) {
      return NextResponse.json({ error: "photo_url required" }, { status: 400 });
    }
    const result = await pushLiveRoomPhoto(
      supabase,
      liveRoomId,
      url,
      typeof payload.caption === "string" ? payload.caption : undefined,
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
