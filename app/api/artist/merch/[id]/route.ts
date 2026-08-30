import { NextResponse } from "next/server";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import {
  deleteMerchItem,
  updateMerchItem,
  type MerchCategory,
} from "@/lib/dashboard/artist-merch";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { createRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function parseCategory(value: unknown): MerchCategory | undefined {
  if (value === "clothing" || value === "digital" || value === "physical") {
    return value;
  }
  return undefined;
}

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

  const patch: Parameters<typeof updateMerchItem>[3] = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.description === "string" || body.description === null) {
    patch.description = body.description as string | null;
  }
  if (body.price_xof != null) patch.price_xof = Number(body.price_xof);
  const cat = parseCategory(body.category);
  if (cat) patch.category = cat;
  if (body.quantity_available !== undefined) {
    patch.quantity_available =
      body.quantity_available == null || body.quantity_available === ""
        ? null
        : Math.max(0, Math.round(Number(body.quantity_available)));
  }
  if (typeof body.active === "boolean") patch.active = body.active;
  if (Array.isArray(body.image_urls)) {
    patch.image_urls = body.image_urls.filter(
      (u): u is string => typeof u === "string",
    );
  }

  const result = await updateMerchItem(supabase, current.user.id, id, patch);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, missing_table: result.missingTable },
      { status: result.missingTable ? 503 : 400 },
    );
  }

  return NextResponse.json({ ok: true, item: result.item });
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

  const result = await deleteMerchItem(supabase, current.user.id, id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, missing_table: result.missingTable },
      { status: result.missingTable ? 503 : 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
