import { StudioFanClubManager } from "@/components/studio/studio-fan-club-manager";
import { StudioPortalEditor } from "@/components/studio/studio-portal-editor";
import { StudioPortalWorlds } from "@/components/studio/studio-portal-worlds";
import { WorldDecorateChecklist } from "@/components/studio/world-decorate-checklist";
import { loadFanClubTiers } from "@/lib/dashboard/fan-club";
import { loadPortalReleases } from "@/lib/dashboard/portal-releases";
import {
  loadStudioPortalProfile,
  requireStudioArtist,
} from "@/lib/studio/require-artist";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ setup?: string }>;
};

export default async function StudioPortalPage({ searchParams }: Props) {
  const { setup: setupRaw } = await searchParams;
  const setupPlaces = setupRaw?.trim() === "places";

  const { supabase, userId, displayName } =
    await requireStudioArtist("/studio/portal");
  const profile = await loadStudioPortalProfile(supabase, userId, displayName);
  const needsPlaces = profile.countries.length < 1;
  const fanClub = await loadFanClubTiers(supabase, userId, { includeInactive: true });
  const portalWorlds = await loadPortalReleases(supabase, userId);

  return (
    <>
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[var(--rect)]">
        RECT Artist · World
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
        Decorate my World
      </h1>
      <p className="mt-2 text-sm text-white/45">
        Likeness, banner, and portal worlds fans enter from your public page —
        end to end on RECT Artist.
      </p>
      {needsPlaces ? (
        <p className="mt-4 rounded-lg border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-3 text-sm text-[#F5A623]">
          Add at least one place and genre so Charts and discovery can find your
          music.
        </p>
      ) : null}
      <div className="mt-8 space-y-12">
        <WorldDecorateChecklist
          profile={profile}
          worlds={portalWorlds.releases}
          artistId={userId}
        />
        <StudioPortalEditor
          artistId={userId}
          profile={profile}
          emphasizeSetup={setupPlaces || needsPlaces}
        />
        <StudioFanClubManager initialTiers={fanClub.tiers} />
        <div id="portal-worlds">
          <StudioPortalWorlds
            artistId={userId}
            initialReleases={portalWorlds.releases}
          />
        </div>
      </div>
    </>
  );
}
