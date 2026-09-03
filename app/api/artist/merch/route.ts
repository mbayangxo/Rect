import { NextResponse } from "next/server";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import {
  createMerchItem,
  loadArtistMerchItems,
  type MerchCategory,
  type MerchMusicFormat,
} from "@/lib/dashboard/artist-merch";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { createRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseMusicFormat(value: unknown): MerchMusicFormat | null {
  if (value === "album" || value === "cd" || value === "vinyl") return value;
  if (value === null || value === "") return null;
  return null;
}

function parseCategory(value: unknown): MerchCategory | null {
  if (value === "clothing" || value === "digital" || value === "physical") {
    return value;
  }
  return null;
}

export async function GET(request: Request) {
  const supabase = await createRouteClient(request);
  const current = await getDashboardCurrentUser(supabase);
  if (!current.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!isArtistAccount(current.profile, current.user)) {
    return NextResponse.json({ error: "Artist account required." }, { status: 403 });
  }

  const res = await loadArtistMerchItems(supabase, current.user.id, {
    includeInactive: true,
  });

  return NextResponse.json({
    items: res.items,
    missing_table: res.missingTable,
    error: res.error,
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

  const title = typeof body.title === "string" ? body.title : "";
  const category = parseCategory(body.category) ?? "physical";
  const price_xof = Number(body.price_xof);
  if (!Number.isFinite(price_xof) || price_xof < 0) {
    return NextResponse.json({ error: "Valid price in XOF required." }, { status: 400 });
  }

  const qtyRaw = body.quantity_available;
  const quantity_available =
    qtyRaw == null || qtyRaw === ""
      ? null
      : Math.max(0, Math.round(Number(qtyRaw)));

  const music_format = parseMusicFormat(body.music_format);
  const track_id =
    typeof body.track_id === "string" && body.track_id.trim()
      ? body.track_id.trim()
      : null;

  if (music_format && !track_id) {
    return NextResponse.json(
      { error: "Link a track when selling album, CD, or vinyl." },
      { status: 400 },
    );
  }

  const result = await createMerchItem(supabase, current.user.id, {
    title,
    description: typeof body.description === "string" ? body.description : null,
    price_xof,
    category,
    music_format,
    track_id,
    quantity_available: Number.isFinite(quantity_available as number)
      ? quantity_available
      : null,
    active: body.active !== false,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, missing_table: result.missingTable },
      { status: result.missingTable ? 503 : 400 },
    );
  }

  return NextResponse.json({ ok: true, item: result.item });
}
