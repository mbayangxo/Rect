import { NextResponse } from "next/server";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import { loadStudioFanProfile } from "@/lib/dashboard/artist-fan-profile";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { createRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ fanId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { fanId: raw } = await ctx.params;
  const fanId = raw?.trim();
  if (!fanId) {
    return NextResponse.json({ error: "fanId required" }, { status: 400 });
  }

  const supabase = await createRouteClient(request);
  const current = await getDashboardCurrentUser(supabase);
  if (!current.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!isArtistAccount(current.profile, current.user)) {
    return NextResponse.json({ error: "Artist account required." }, { status: 403 });
  }

  const url = new URL(request.url);
  const data = await loadStudioFanProfile(supabase, current.user.id, fanId, {
    range: url.searchParams.get("range"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });

  if (data.error === "Invalid fan.") {
    return NextResponse.json({ error: data.error }, { status: 400 });
  }

  return NextResponse.json(data);
}
