import { StudioAnalyticsDashboard } from "@/components/studio/studio-analytics-dashboard";
import { loadArtistAnalyticsDashboard } from "@/lib/dashboard/artist-analytics";
import { requireStudioArtist } from "@/lib/studio/require-artist";

export const dynamic = "force-dynamic";

export default async function StudioAnalyticsPage() {
  const { supabase, userId } = await requireStudioArtist("/studio/analytics");
  const data = await loadArtistAnalyticsDashboard(supabase, userId);

  return (
    <>
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[#1DB954]">
        Analytics
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
        Performance
      </h1>
      <p className="mt-2 text-sm text-white/45">
        Plays, followers, and demo play earnings from credited listens.
      </p>
      <div className="mt-8">
        <StudioAnalyticsDashboard data={data} />
      </div>
    </>
  );
}
