import { NextResponse } from "next/server";
import { sendShareThanks } from "@/lib/dashboard/shares";
import { createClient } from "@/lib/supabase/server";

type Body = { notification_id?: number; message?: string };

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const notificationId = Number(body.notification_id);
  if (!Number.isFinite(notificationId) || notificationId <= 0) {
    return NextResponse.json(
      { error: "notification_id is required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const result = await sendShareThanks(
    supabase,
    notificationId,
    typeof body.message === "string" ? body.message : "",
  );

  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "missing_table"
          ? 503
          : result.code === "notification_not_found"
            ? 404
            : result.code === "not_recipient" ||
                result.code === "not_a_share" ||
                result.code === "already_thanked" ||
                result.code === "blocked" ||
                result.code === "invalid_message"
              ? 400
              : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    notification_id: result.notification_id,
    thanks_message: result.thanks_message,
    skipped: result.skipped ?? null,
  });
}
