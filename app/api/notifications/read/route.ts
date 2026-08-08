import { NextResponse } from "next/server";
import { markNotificationsRead } from "@/lib/dashboard/notifications";
import { createClient } from "@/lib/supabase/server";

type Body = { ids?: number[] };

export async function POST(request: Request) {
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
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

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((n) => Number.isFinite(n)).map(Number)
    : undefined;

  const result = await markNotificationsRead(supabase, ids);
  if (!result.ok) {
    const status = result.code === "missing_table" ? 503 : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({ ok: true, marked: result.marked });
}
