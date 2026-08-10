import { redirect } from "next/navigation";
import { StudioClient } from "@/app/studio/studio-client";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import { loadArtistStudioStats } from "@/lib/dashboard/artist-stats";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ focus?: string; setup?: string }>;
};

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

export default async function StudioPage({ searchParams }: Props) {
  const { focus: focusRaw, setup: setupRaw } = await searchParams;
  const focusTrackId = focusRaw?.trim() || null;
  const setupPlaces = setupRaw?.trim() === "places";

  const supabase = await createClient();
  const current = await getDashboardCurrentUser(supabase);

  if (!current.ok || !current.user) {
    redirect("/auth/login?next=/studio");
  }

  if (!isArtistAccount(current.profile, current.user)) {
    redirect("/dashboard");
  }

  const user = current.user;
  const stats = await loadArtistStudioStats(supabase, user.id);

  let portal = {
    city: "",
    artistBio: "",
    countries: asStringList(current.profile?.countries),
    genres: asStringList(current.profile?.genres),
    avatarUrl:
      (typeof user.user_metadata?.avatar_url === "string" &&
        user.user_metadata.avatar_url.trim()) ||
      null,
  };

  const full = await supabase
    .from("users")
    .select("city, artist_bio, countries, genres, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  if (!full.error && full.data) {
    portal = {
      city: typeof full.data.city === "string" ? full.data.city : "",
      artistBio:
        typeof full.data.artist_bio === "string" ? full.data.artist_bio : "",
      countries: asStringList(full.data.countries),
      genres: asStringList(full.data.genres),
      avatarUrl:
        (typeof full.data.avatar_url === "string" &&
          full.data.avatar_url.trim()) ||
        portal.avatarUrl,
    };
  } else if (
    full.error &&
    /avatar_url|artist_bio|city|column .* does not exist/i.test(full.error.message)
  ) {
    const lean = await supabase
      .from("users")
      .select("countries, genres")
      .eq("id", user.id)
      .maybeSingle();
    if (!lean.error && lean.data) {
      portal = {
        ...portal,
        countries: asStringList(lean.data.countries),
        genres: asStringList(lean.data.genres),
      };
    }
  }

  const displayName =
    current.displayName ||
    (typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : null) ||
    user.email?.split("@")[0] ||
    "Artist";

  const needsPlaces = portal.countries.length < 1;

  return (
    <StudioClient
      displayName={displayName}
      avatarUrl={portal.avatarUrl}
      artistId={user.id}
      city={portal.city}
      artistBio={portal.artistBio}
      countries={portal.countries}
      genres={portal.genres}
      tracks={stats.tracks}
      totalPlays={stats.totalPlays}
      publishedCount={stats.publishedCount}
      draftCount={stats.draftCount}
      loadError={stats.error}
      focusTrackId={focusTrackId}
      setupPlaces={setupPlaces || needsPlaces}
      needsPlaces={needsPlaces}
    />
  );
}
