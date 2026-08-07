import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { loadArtistPortals } from "@/lib/dashboard/artists";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { loadPlayPacks } from "@/lib/dashboard/play-packs";
import {
  loadDakarChart,
  loadFeaturedTracks,
} from "@/lib/dashboard/tracks";
import { createClient } from "@/lib/supabase/server";
import "./dashboard.css";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const current = await getDashboardCurrentUser(supabase);

  if (!current.ok && current.reason === "no_session") {
    redirect("/onboarding");
  }

  if (!current.ok) {
    return (
      <main className="dash-app">
        <header className="dash-topbar">
          <div className="dash-logo-wrap">
            <div className="dash-logo-box">
              <span className="dash-logo-ect">RECT</span>
            </div>
            <div className="dash-logo-divider" />
            <span className="dash-logo-section">Sound</span>
          </div>
        </header>
        <div className="dash-empty" role="alert">
          <p className="dash-empty-title">Could not load your account</p>
          <p className="dash-empty-body">{current.error}</p>
          <Link href="/onboarding" className="dash-empty-link">
            Go to onboarding
          </Link>
        </div>
      </main>
    );
  }

  const [featuredRes, chartRes, artistsRes, packsRes] = await Promise.all([
    loadFeaturedTracks(supabase),
    loadDakarChart(supabase),
    loadArtistPortals(supabase),
    loadPlayPacks(supabase, "SN"),
  ]);

  return (
    <DashboardShell
      displayName={current.displayName}
      featured={featuredRes.tracks}
      featuredError={featuredRes.ok ? null : featuredRes.error}
      chart={chartRes.tracks}
      chartError={chartRes.ok ? null : chartRes.error}
      artists={artistsRes.artists}
      artistsError={artistsRes.ok ? null : artistsRes.error}
      packs={packsRes.ok ? packsRes.packs : []}
    />
  );
}
