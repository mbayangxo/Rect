import { NextResponse } from "next/server";
import { loadBehaviorAffinity } from "@/lib/dashboard/behavior";
import { createRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

/** Debug / profile: behavior affinity learned from plays + likes. */
export async function GET(request: Request) {
  const supabase = await createRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const days = Math.min(
    365,
    Math.max(7, Number(url.searchParams.get("days")) || 90),
  );

  const affinity = await loadBehaviorAffinity(supabase, days);
  return NextResponse.json({ ok: true, affinity });
}
