import { StudioLiveRoomManager } from "@/components/studio/studio-live-room-manager";
import { loadArtistLiveRoomSession } from "@/lib/dashboard/live-rooms";
import {
  loadStudioPortalProfile,
  requireStudioArtist,
} from "@/lib/studio/require-artist";

export const dynamic = "force-dynamic";

export default async function StudioLivePage() {
  const { supabase, userId, displayName } = await requireStudioArtist(
    "/studio/live",
  );
  const profile = await loadStudioPortalProfile(supabase, userId, displayName);
  const session = await loadArtistLiveRoomSession(supabase, userId);

  return (
    <>
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[#1DB954]">
        Live Room
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
        Go live in your World
      </h1>
      <p className="mt-2 max-w-xl text-sm text-white/45">
        Everyday Live Rooms — video, photos, or audio. Fans join from your
        Artist World. RECT Live (pro stage) comes later.
      </p>
      <div className="mt-8">
        <StudioLiveRoomManager
          artistId={userId}
          initialRoom={session.room}
          missingTable={session.missingTable}
          countries={profile.countries}
          city={profile.city}
        />
      </div>
    </>
  );
}
