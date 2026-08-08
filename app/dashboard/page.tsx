import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { loadArtistPortals } from "@/lib/dashboard/artists";
import { loadPlayCreditBalance } from "@/lib/dashboard/credits";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { loadLikedTrackIds } from "@/lib/dashboard/likes";
import { loadContinueListening } from "@/lib/dashboard/listening-journal";
import { loadPlayPacks } from "@/lib/dashboard/play-packs";
import {
  hasTasteSignal,
  packCountryFromTaste,
  tasteFromProfile,
} from "@/lib/dashboard/taste";
import { loadFeaturedTracks } from "@/lib/dashboard/tracks";
import { createClient } from "@/lib/supabase/server";
import "./dashboard.css";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const current = await getDashboardCurrentUser(supabase);

  if (!current.ok && current.reason === "no_session") {
    redirect("/auth/login?next=/dashboard");
  }

  if (!current.ok) {
    if (
      current.reason === "no_session" ||
      /session missing|Auth session missing/i.test(current.error)
    ) {
      redirect("/auth/login?next=/dashboard");
    }
    return (
      <main className="dash-app w-full max-w-none">
        <header className="dash-topbar mx-auto w-full max-w-7xl px-4 sm:px-8">
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
          <Link href="/auth/login?next=/dashboard" className="dash-empty-link">
            Log in
          </Link>
        </div>
      </main>
    );
  }

  const taste = tasteFromProfile(current.profile);
  const packCountry = packCountryFromTaste(taste);
  const personalized = hasTasteSignal(taste);
  const showArtistStudio =
    current.profile?.account_type === "artist" ||
    current.profile?.role === "artist" ||
    (typeof current.user.user_metadata?.role === "string" &&
      current.user.user_metadata.role === "artist") ||
    (typeof current.user.user_metadata?.account_type === "string" &&
      current.user.user_metadata.account_type === "artist");

  const [
    featuredRes,
    artistsRes,
    packsRes,
    creditsRes,
    likesRes,
    continueRes,
  ] = await Promise.all([
    loadFeaturedTracks(supabase, taste),
    loadArtistPortals(supabase, taste),
    loadPlayPacks(supabase, packCountry),
    loadPlayCreditBalance(supabase),
    loadLikedTrackIds(supabase, current.user.id),
    loadContinueListening(supabase, current.user.id, 8),
  ]);

  return (
    <DashboardShell
      displayName={current.displayName}
      featured={featuredRes.tracks}
      featuredError={featuredRes.ok ? null : featuredRes.error}
      artists={artistsRes.artists}
      artistsError={artistsRes.ok ? null : artistsRes.error}
      packs={packsRes.ok ? packsRes.packs : []}
      packCountry={
        packsRes.ok && packsRes.packs[0]?.country
          ? packsRes.packs[0].country
          : packCountry
      }
      personalized={personalized}
      tasteGenres={taste.genres.slice(0, 3)}
      tasteCountries={taste.countries.slice(0, 2)}
      creditBalance={creditsRes.credits}
      creditsReady={!creditsRes.missingTable}
      likedTrackIds={likesRes.likedIds}
      likesReady={!likesRes.missingTable}
      showArtistStudio={showArtistStudio}
      continueListening={continueRes.entries}
      continueError={continueRes.error}
    />
  );
}
