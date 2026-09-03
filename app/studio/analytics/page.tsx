import { StudioAnalyticsDashboard } from "@/components/studio/studio-analytics-dashboard";
import { LabelRollupPanel, loadLabelRollup } from "@/components/studio/label-rollup-panel";
import { loadStudioAnalytics } from "@/lib/dashboard/artist-analytics";
import type { AnalyticsRangeId } from "@/lib/dashboard/analytics-time";
import { requireStudioArtist } from "@/lib/studio/require-artist";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
};

export default async function StudioAnalyticsPage({ searchParams }: Props) {
  const params = await searchParams;
  const range = (params.range ?? "week") as AnalyticsRangeId;
  const { supabase, userId } = await requireStudioArtist("/studio/analytics");
  const [data, labelRollup] = await Promise.all([
    loadStudioAnalytics(supabase, userId, {
      range,
      from: params.from ?? null,
      to: params.to ?? null,
    }),
    loadLabelRollup(supabase, userId),
  ]);

  return (
    <>
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[var(--rect)]">
        Analytics
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
        Performance
      </h1>
      <p className="mt-2 text-sm text-white/45">
        Streams, completion, funnel, compare, audience, and label rollup from
        Supabase — no demo filler.
      </p>
      <div className="mt-6">
        <LabelRollupPanel rollup={labelRollup} />
      </div>
      <div className="mt-8">
        <StudioAnalyticsDashboard initialData={data} />
      </div>
    </>
  );
}
