import { NextResponse } from "next/server";
import { purchasePlayPack } from "@/lib/dashboard/credits";
import { createRouteClient } from "@/lib/supabase/route";

type Body = { pack_id?: string | number };

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const packId = body.pack_id == null ? "" : String(body.pack_id).trim();
  if (!packId) {
    return NextResponse.json({ error: "pack_id is required" }, { status: 400 });
  }

  const supabase = await createRouteClient(request);
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

  const result = await purchasePlayPack(supabase, packId);
  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "pack_not_found"
          ? 404
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
