import { NextResponse } from "next/server";
import {
  loadBlockedPeople,
  loadIsBlocked,
  toggleUserBlock,
} from "@/lib/dashboard/blocks";
import { createClient } from "@/lib/supabase/server";

type Body = { user_id?: string };

export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get("user_id")?.trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // List outgoing blocks (settings)
  if (!userId) {
    if (!user) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    const result = await loadBlockedPeople(supabase, user.id);
    if (result.missingTable) {
      return NextResponse.json(
        { error: "Blocks not set up", code: "missing_table", people: [] },
        { status: 503 },
      );
    }
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({
      people: result.people,
      authenticated: true,
    });
  }

  if (!user) {
    return NextResponse.json({
      blocked: false,
      authenticated: false,
      user_id: userId,
    });
  }

  if (user.id === userId) {
    return NextResponse.json({
      blocked: false,
      authenticated: true,
      user_id: userId,
      self: true,
    });
  }

  const result = await loadIsBlocked(supabase, user.id, userId);
  if (result.missingTable) {
    return NextResponse.json(
      { error: "Blocks not set up", code: "missing_table" },
      { status: 503 },
    );
  }

  return NextResponse.json({
    blocked: result.blocked,
    authenticated: true,
    user_id: userId,
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

  const targetId = body.user_id?.trim();
  if (!targetId) {
    return NextResponse.json(
      { error: "user_id is required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const result = await toggleUserBlock(supabase, targetId);
  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "missing_table"
          ? 503
          : result.code === "cannot_block_self"
            ? 400
            : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    blocked: result.blocked,
    user_id: result.user_id,
  });
}
