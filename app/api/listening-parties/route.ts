import { NextResponse } from "next/server";
import {
  createListeningParty,
  loadLiveParties,
} from "@/lib/dashboard/listening-parties";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { createRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createRouteClient(request);
  const result = await loadLiveParties(supabase, 24);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const supabase = await createRouteClient(request);
  const current = await getDashboardCurrentUser(supabase);
  if (!current.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { title?: string; track_id?: string | null };
  try {
    body = (await request.json()) as { title?: string; track_id?: string | null };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = (body.title ?? "").trim() || "Listening party";
  const result = await createListeningParty(
    supabase,
    title,
    body.track_id ?? null,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, missing_table: result.missingTable },
      { status: result.missingTable ? 503 : 400 },
    );
  }
  return NextResponse.json({ ok: true, party_id: result.party_id });
}
