import { NextResponse } from "next/server";
import { sendTipThanks, TIP_THANKS_MAX } from "@/lib/dashboard/tips";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };
type Body = { message?: string };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const tipId = Number(id);
  if (!Number.isFinite(tipId) || tipId <= 0) {
    return NextResponse.json({ error: "Invalid tip id" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json(
      { error: "Write a short thank-you", code: "message_required" },
      { status: 400 },
    );
  }
  if (message.length > TIP_THANKS_MAX) {
    return NextResponse.json(
      { error: `Thanks must be ${TIP_THANKS_MAX} characters or fewer` },
      { status: 400 },
    );
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

  const result = await sendTipThanks(supabase, tipId, message);
  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "missing_table"
          ? 503
          : result.code === "tip_not_found"
            ? 404
            : result.code === "not_tip_owner" ||
                result.code === "already_thanked" ||
                result.code === "message_required"
              ? 400
              : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    tip_id: result.tip_id,
    thanks_message: result.thanks_message,
    skipped: result.skipped ?? null,
  });
}
