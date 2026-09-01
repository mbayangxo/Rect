import { NextResponse } from "next/server";
import {
  loadDmThread,
  markDmRead,
  sendDm,
} from "@/lib/dashboard/dms";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const conversationId = id?.trim();
  if (!conversationId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const result = await loadDmThread(supabase, user.id, conversationId);
  if (result.missingTable) {
    return NextResponse.json(
      { error: result.error, code: "missing_table" },
      { status: 503 },
    );
  }
  if (result.notParticipant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  await markDmRead(supabase, conversationId);

  return NextResponse.json({
    messages: result.messages,
    other_id: result.other_id,
    other_name: result.other_name,
    other_avatar: result.other_avatar,
  });
}

type Body = { body?: string };

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const conversationId = id?.trim();
  if (!conversationId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  let payload: Body;
  try {
    payload = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof payload.body === "string" ? payload.body : "";
  const supabase = await createClient();
  const result = await sendDm(supabase, conversationId, text);
  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "missing_table"
          ? 503
          : result.code === "blocked" ||
              result.code === "body_required" ||
              result.code === "not_participant"
            ? 400
            : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({ ok: true, message: result.message });
}
