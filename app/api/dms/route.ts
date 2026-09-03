import { NextResponse } from "next/server";
import { loadDmThreads, openOrGetDm } from "@/lib/dashboard/dms";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const result = await loadDmThreads(supabase, user.id);
  if (result.missingTable) {
    return NextResponse.json(
      { error: result.error, code: "missing_table", threads: [] },
      { status: 503 },
    );
  }
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ threads: result.threads });
}

type Body = { user_id?: string };

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const otherId = body.user_id?.trim();
  if (!otherId) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const result = await openOrGetDm(supabase, otherId);
  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "missing_table"
          ? 503
          : result.code === "blocked" ||
              result.code === "cannot_dm_self" ||
              result.code === "user_not_found"
            ? 400
            : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    conversation_id: result.conversation_id,
    other_id: result.other_id,
  });
}
