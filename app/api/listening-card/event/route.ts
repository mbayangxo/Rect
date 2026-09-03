import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENT_TYPES = new Set([
  "view",
  "share",
  "copy_link",
  "send_friend",
  "open_card",
]);

type Body = {
  track_id?: string;
  event_type?: string;
  channel?: string;
  recipient_id?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Record a listening-card / share event for analytics + future royalties.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const trackId = body.track_id?.trim();
  const eventType = (body.event_type ?? "").trim();
  if (!trackId) {
    return NextResponse.json({ error: "track_id required" }, { status: 400 });
  }
  if (!EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
  }

  const supabase = await createRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const db = admin ?? supabase;

  const row = {
    track_id: trackId,
    actor_id: user?.id ?? null,
    event_type: eventType,
    channel: body.channel?.trim()?.slice(0, 40) || null,
    recipient_id: body.recipient_id?.trim() || null,
    metadata: body.metadata && typeof body.metadata === "object"
      ? body.metadata
      : {},
  };

  const { error } = await db.from("listening_card_events").insert(row);
  if (error) {
    const missing = /listening_card_events|does not exist|PGRST205/i.test(
      error.message,
    );
    return NextResponse.json(
      {
        error: missing
          ? "Run 20260903_listening_card_events.sql in Supabase."
          : error.message,
        code: missing ? "missing_migration" : "insert_failed",
      },
      { status: missing ? 503 : 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
