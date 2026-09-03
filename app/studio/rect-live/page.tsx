import { StudioRectLiveManager } from "@/components/studio/studio-rect-live-manager";
import { loadPortalReleases } from "@/lib/dashboard/portal-releases";
import { loadArtistActiveRectLive } from "@/lib/dashboard/rect-live";
import {
  loadStudioPortalProfile,
  requireStudioArtist,
} from "@/lib/studio/require-artist";

export const dynamic = "force-dynamic";

export default async function StudioRectLivePage() {
  const { supabase, userId, displayName } = await requireStudioArtist(
    "/studio/rect-live",
  );
  const profile = await loadStudioPortalProfile(supabase, userId, displayName);
  const [liveRes, portalsRes] = await Promise.all([
    loadArtistActiveRectLive(supabase, userId),
    loadPortalReleases(supabase, userId, { publishedOnly: true }),
  ]);

  return (
    <>
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[#1DB954]">
        RECT Live
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
        Professional stage
      </h1>
      <p className="mt-2 max-w-xl text-sm text-white/45">
        Pro performances in your World — or inside a Portal for premieres and
        unlock parties. Casual hangs stay in Live Room.
      </p>
      <div className="mt-8">
        <StudioRectLiveManager
          artistId={userId}
          initialLive={liveRes.live}
          missingTable={liveRes.missingTable}
          portals={portalsRes.releases}
          countries={profile.countries}
          city={profile.city}
        />
      </div>
    </>
  );
}
