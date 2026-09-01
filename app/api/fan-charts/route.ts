import { NextResponse } from "next/server";
import {
  addTrackToFanChart,
  ensureDefaultFanChart,
  loadFanCharts,
} from "@/lib/dashboard/fan-charts";
import { createRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createRouteClient(request);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const result = await loadFanCharts(supabase, user.id);
  return NextResponse.json(result);
}

type Body = { track_id?: string; chart_id?: string };

export async function POST(request: Request) {
  const supabase = await createRouteClient(request);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const trackId = (body.track_id ?? "").trim();
  if (!trackId) {
    return NextResponse.json({ error: "track_id is required." }, { status: 400 });
  }

  let chartId = (body.chart_id ?? "").trim();
  if (!chartId) {
    const chart = await ensureDefaultFanChart(supabase, user.id);
    if (!chart) {
      return NextResponse.json(
        { error: "Run 20260830_monetization_stack.sql in Supabase." },
        { status: 503 },
      );
    }
    chartId = chart.id;
  }

  const result = await addTrackToFanChart(
    supabase,
    chartId,
    user.id,
    trackId,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const charts = await loadFanCharts(supabase, user.id);
  return NextResponse.json({
    ok: true,
    position: result.position,
    chart_id: chartId,
    charts: charts.charts,
  });
}
