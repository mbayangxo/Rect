import { NextResponse } from "next/server";
import {
  joinParty,
  loadPartyByCode,
} from "@/lib/dashboard/listening-parties";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { createRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

/** Resolve invite code → party, then join. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  if (!code) {
    return NextResponse.json({ error: "Code required." }, { status: 400 });
  }

  const supabase = await createRouteClient(request);
  const current = await getDashboardCurrentUser(supabase);
  if (!current.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const found = await loadPartyByCode(supabase, code);
  if (found.missingTable) {
    return NextResponse.json(
      { error: "Run 20260903_listening_parties.sql", missing_table: true },
      { status: 503 },
    );
  }
  if (!found.party) {
    return NextResponse.json({ error: "Party not found." }, { status: 404 });
  }
  if (found.party.status !== "live") {
    return NextResponse.json({ error: "Party has ended." }, { status: 410 });
  }

  const joined = await joinParty(supabase, found.party.id, current.user.id);
  if (!joined.ok) {
    return NextResponse.json({ error: joined.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, party_id: found.party.id });
}
