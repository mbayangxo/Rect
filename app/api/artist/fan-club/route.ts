import { NextResponse } from "next/server";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import { upsertFanClubTier } from "@/lib/dashboard/fan-club";
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

  const url = new URL(request.url);
  const artistId = url.searchParams.get("artist_id") ?? current.user.id;

  const { loadFanClubTiers } = await import("@/lib/dashboard/fan-club");
  const result = await loadFanClubTiers(supabase, artistId, {
    includeInactive: artistId === current.user.id,
  });

  return NextResponse.json(result);
}

type TierBody = {
  id?: number;
  name?: string;
  description?: string;
  price_xof_month?: number;
  perks?: string[];
  sort_order?: number;
  active?: boolean;
};

export async function POST(request: Request) {
  const supabase = await createRouteClient(request);
  const current = await getDashboardCurrentUser(supabase);
  if (!current.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!isArtistAccount(current.profile, current.user)) {
    return NextResponse.json({ error: "Artist account required." }, { status: 403 });
  }

  let body: TierBody;
  try {
    body = (await request.json()) as TierBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Tier name is required." }, { status: 400 });
  }

  const result = await upsertFanClubTier(supabase, current.user.id, {
    id: body.id,
    name,
    description: body.description,
    priceXofMonth: Number(body.price_xof_month) || 0,
    perks: body.perks,
    sortOrder: body.sort_order,
    active: body.active,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, tier: result.tier });
}
