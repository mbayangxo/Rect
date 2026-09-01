import { NextResponse } from "next/server";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import {
  createTourEvent,
  loadTourEvents,
} from "@/lib/dashboard/tour-events";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { createRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createRouteClient(request);
  const current = await getDashboardCurrentUser(supabase);
  if (!current.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!isArtistAccount(current.profile, current.user)) {
    return NextResponse.json({ error: "Artist account required." }, { status: 403 });
  }

  const result = await loadTourEvents(supabase, current.user.id, {
    includeInactive: true,
  });

  return NextResponse.json({
    events: result.events,
    ready: result.ready,
    error: result.error,
  });
}

export async function POST(request: Request) {
  const supabase = await createRouteClient(request);
  const current = await getDashboardCurrentUser(supabase);
  if (!current.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!isArtistAccount(current.profile, current.user)) {
    return NextResponse.json({ error: "Artist account required." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await createTourEvent(supabase, current.user.id, {
    title: typeof body.title === "string" ? body.title : "",
    description:
      typeof body.description === "string" ? body.description : null,
    city: typeof body.city === "string" ? body.city : "",
    venue: typeof body.venue === "string" ? body.venue : null,
    starts_at: typeof body.starts_at === "string" ? body.starts_at : "",
    ends_at: typeof body.ends_at === "string" ? body.ends_at : null,
    ticket_price_xof:
      body.ticket_price_xof == null || body.ticket_price_xof === ""
        ? null
        : Number(body.ticket_price_xof),
    capacity:
      body.capacity == null || body.capacity === ""
        ? null
        : Number(body.capacity),
    fekk_event_id:
      typeof body.fekk_event_id === "string" ? body.fekk_event_id : null,
    fekk_checkout_url:
      typeof body.fekk_checkout_url === "string"
        ? body.fekk_checkout_url
        : null,
    active: body.active !== false,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, missing_table: result.missingTable },
      { status: result.missingTable ? 503 : 400 },
    );
  }

  return NextResponse.json({ ok: true, event: result.event });
}
