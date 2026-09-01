import { StudioTourManager } from "@/components/studio/studio-tour-manager";
import { loadCityDemandForArtist } from "@/lib/dashboard/tour-demand";
import { loadTourEvents } from "@/lib/dashboard/tour-events";
import { requireStudioArtist } from "@/lib/studio/require-artist";

export const dynamic = "force-dynamic";

export default async function StudioToursPage() {
  const { supabase, userId } = await requireStudioArtist("/studio/tours");
  const [eventsRes, demandRes] = await Promise.all([
    loadTourEvents(supabase, userId, { includeInactive: true }),
    loadCityDemandForArtist(supabase, userId),
  ]);

  return (
    <>
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[#1DB954]">
        Tours
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
        Where to play
      </h1>
      <p className="mt-2 text-sm text-white/45">
        See fan city demand, publish shows, and sell tickets through FEKK.
      </p>
      <div className="mt-8">
        <StudioTourManager
          initialEvents={eventsRes.events}
          demand={demandRes.rows}
          ready={eventsRes.ready}
          demandReady={demandRes.ready}
          storeError={eventsRes.error ?? demandRes.error}
        />
      </div>
    </>
  );
}
