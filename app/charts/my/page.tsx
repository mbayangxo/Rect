import Link from "next/link";
import { redirect } from "next/navigation";
import { RectLogo } from "@/components/rect-logo";
import { loadFanCharts } from "@/lib/dashboard/fan-charts";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { trackTitle, type TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

export default async function MyChartPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/charts/my");
  }

  const { charts, ready } = await loadFanCharts(supabase, user.id);
  const chart = charts[0];
  const admin = createAdminClient();
  const db = admin ?? supabase;

  const trackIds = chart?.entries.map((e) => e.trackId) ?? [];
  let tracks: TrackRow[] = [];
  if (trackIds.length > 0) {
    const { data } = await db
      .from("tracks")
      .select("id, title, cover_art_url, artist_id")
      .in("id", trackIds);
    tracks = (data ?? []) as TrackRow[];
  }
  const trackById = new Map(tracks.map((t) => [t.id, t]));

  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10 px-4 py-4">
        <Link href="/charts">
          <RectLogo size={28} showWordmark />
        </Link>
      </header>
      <div className="mx-auto max-w-lg px-4 py-8">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[#1DB954]">
          Personal chart
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold">
          {chart?.title ?? "My Chart"}
        </h1>
        <p className="mt-2 text-sm text-white/45">
          Your personal ranking — separate from STANDINGS. Add tracks while you listen.
        </p>

        {!ready ? (
          <p className="mt-8 text-sm text-white/35">
            Run{" "}
            <code className="text-[0.9em]">20260830_monetization_stack.sql</code> in
            Supabase to enable personal charts.
          </p>
        ) : !chart || chart.entries.length === 0 ? (
          <p className="mt-8 text-sm text-white/35">
            No tracks on your chart yet. Play songs and add them from track pages.
          </p>
        ) : (
          <ol className="mt-8 space-y-2">
            {chart.entries.map((entry) => {
              const t = trackById.get(entry.trackId);
              return (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.08] px-4 py-3"
                >
                  <span className="w-6 text-lg font-semibold tabular-nums text-[#1DB954]">
                    {entry.position}
                  </span>
                  {t?.cover_art_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.cover_art_url}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 text-xs">
                      ♫
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {t ? trackTitle(t) : entry.trackId.slice(0, 8)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <Link
          href="/charts"
          className="mt-8 inline-block text-sm text-[#1DB954] hover:underline"
        >
          ← STANDINGS charts
        </Link>
      </div>
    </main>
  );
}
