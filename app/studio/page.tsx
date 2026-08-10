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
  const displayName =
    current.displayName ||
    (typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : null) ||
    user.email?.split("@")[0] ||
    "Artist";
  const avatarUrl =
    (typeof user.user_metadata?.avatar_url === "string" &&
      user.user_metadata.avatar_url.trim()) ||
    null;

  return (
    <StudioClient
      displayName={displayName}
      avatarUrl={avatarUrl}
      artistId={user.id}
      tracks={stats.tracks}
      totalPlays={stats.totalPlays}
      publishedCount={stats.publishedCount}
      draftCount={stats.draftCount}
      loadError={stats.error}
      focusTrackId={focusTrackId}
      setupPlaces={setupPlaces}
    />
  );
}
