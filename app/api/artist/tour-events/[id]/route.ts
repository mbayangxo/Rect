import { NextResponse } from "next/server";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import {
  deleteTourEvent,
  updateTourEvent,
} from "@/lib/dashboard/tour-events";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { createRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
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

  const patch: Parameters<typeof updateTourEvent>[3] = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.description === "string" || body.description === null) {
    patch.description = body.description as string | null;
  }
  if (typeof body.city === "string") patch.city = body.city;
  if (typeof body.venue === "string" || body.venue === null) {
    patch.venue = body.venue as string | null;
  }
  if (typeof body.starts_at === "string") patch.starts_at = body.starts_at;
  if (typeof body.ends_at === "string" || body.ends_at === null) {
    patch.ends_at = body.ends_at as string | null;
  }
  if (body.ticket_price_xof !== undefined) {
    patch.ticket_price_xof =
      body.ticket_price_xof == null || body.ticket_price_xof === ""
        ? null
        : Number(body.ticket_price_xof);
  }
  if (body.capacity !== undefined) {
    patch.capacity =
      body.capacity == null || body.capacity === ""
        ? null
        : Number(body.capacity);
  }
  if (typeof body.fekk_event_id === "string" || body.fekk_event_id === null) {
    patch.fekk_event_id = body.fekk_event_id as string | null;
  }
  if (
    typeof body.fekk_checkout_url === "string" ||
    body.fekk_checkout_url === null
  ) {
    patch.fekk_checkout_url = body.fekk_checkout_url as string | null;
  }
  if (typeof body.active === "boolean") patch.active = body.active;

  const result = await updateTourEvent(supabase, current.user.id, id, patch);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, missing_table: result.missingTable },
      { status: result.missingTable ? 503 : 400 },
    );
  }

  return NextResponse.json({ ok: true, event: result.event });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createRouteClient(request);
  const current = await getDashboardCurrentUser(supabase);
  if (!current.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!isArtistAccount(current.profile, current.user)) {
    return NextResponse.json({ error: "Artist account required." }, { status: 403 });
  }

  const result = await deleteTourEvent(supabase, current.user.id, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
