import { StudioPortalEditor } from "@/components/studio/studio-portal-editor";
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

  return (
    <>
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[#1DB954]">
        My portal
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
        Public profile
      </h1>
      <p className="mt-2 text-sm text-white/45">
        How fans see you on RECT SOUND — name, bio, places, genres, and images.
      </p>
      {needsPlaces ? (
        <p className="mt-4 rounded-lg border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-3 text-sm text-[#F5A623]">
          Add at least one place and genre so Charts and discovery can find your
          music.
        </p>
      ) : null}
      <div className="mt-8">
        <StudioPortalEditor
          artistId={userId}
          profile={profile}
          emphasizeSetup={setupPlaces || needsPlaces}
        />
      </div>
    </>
  );
}
