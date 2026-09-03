import type { SupabaseClient } from "@supabase/supabase-js";

export type FanChart = {
  id: string;
  fanId: string;
  title: string;
  isPublic: boolean;
  entries: FanChartEntry[];
};

export type FanChartEntry = {
  id: number;
  chartId: string;
  trackId: string;
  position: number;
};

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205/i.test(
    message,
  );
}

export async function loadFanCharts(
  supabase: SupabaseClient,
  fanId: string,
): Promise<{ charts: FanChart[]; ready: boolean }> {
  const { data, error } = await supabase
    .from("fan_charts")
    .select("id, fan_id, title, is_public")
    .eq("fan_id", fanId)
    .order("created_at", { ascending: false });

  if (error && isMissingRelation(error.message)) {
    return { charts: [], ready: false };
  }

  const charts: FanChart[] = [];
  for (const c of data ?? []) {
    const chartId = String(c.id);
    const { data: entries } = await supabase
      .from("fan_chart_entries")
      .select("id, chart_id, track_id, position")
      .eq("chart_id", chartId)
      .order("position", { ascending: true });

    charts.push({
      id: chartId,
      fanId: String(c.fan_id),
      title: String(c.title),
      isPublic: Boolean(c.is_public),
      entries: (entries ?? []).map((e) => ({
        id: Number(e.id),
        chartId: String(e.chart_id),
        trackId: String(e.track_id),
        position: Number(e.position) || 0,
      })),
    });
  }

  return { charts, ready: true };
}

export async function ensureDefaultFanChart(
  supabase: SupabaseClient,
  fanId: string,
): Promise<FanChart | null> {
  const existing = await loadFanCharts(supabase, fanId);
  if (existing.charts.length > 0) return existing.charts[0] ?? null;

  const { data, error } = await supabase
    .from("fan_charts")
    .insert({ fan_id: fanId, title: "My Chart", is_public: false })
    .select("id, fan_id, title, is_public")
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: String(data.id),
    fanId: String(data.fan_id),
    title: String(data.title),
    isPublic: Boolean(data.is_public),
    entries: [],
  };
}

export async function addTrackToFanChart(
  supabase: SupabaseClient,
  chartId: string,
  fanId: string,
  trackId: string,
): Promise<{ ok: true; position: number } | { ok: false; error: string }> {
  const { data: chart } = await supabase
    .from("fan_charts")
    .select("id")
    .eq("id", chartId)
    .eq("fan_id", fanId)
    .maybeSingle();

  if (!chart) return { ok: false, error: "Chart not found" };

  const { count } = await supabase
    .from("fan_chart_entries")
    .select("id", { count: "exact", head: true })
    .eq("chart_id", chartId);

  const position = (count ?? 0) + 1;

  const { error } = await supabase.from("fan_chart_entries").upsert(
    {
      chart_id: chartId,
      track_id: trackId,
      position,
    },
    { onConflict: "chart_id,track_id" },
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true, position };
}
