import { StudioDeliveryManager } from "@/components/studio/studio-delivery-manager";
import { loadArtistStudioStats } from "@/lib/dashboard/artist-stats";
import { listDistributionReleases } from "@/lib/dashboard/distribution";
import { requireStudioArtist } from "@/lib/studio/require-artist";
import { getTaaliEnvChecklist } from "@/lib/taali/client";

export const dynamic = "force-dynamic";

export default async function StudioDeliveryPage() {
  const { supabase, userId } = await requireStudioArtist("/studio/delivery");
  const [delivery, stats] = await Promise.all([
    listDistributionReleases(supabase, userId),
    loadArtistStudioStats(supabase, userId),
  ]);
  const taaliChecklist = getTaaliEnvChecklist();

  return (
    <>
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[#1DB954]">
        Delivery · Taali
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
        DSP releases
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-white/45">
        Upload once on RECT. Package a release here and send it to Taali for
        Spotify, Apple Music, and more. Tracks marked Punch ready ship their
        punched master. Status only shows live on a DSP after Taali confirms —
        never guessed.
      </p>
      <div className="mt-8">
        <StudioDeliveryManager
          initialReleases={delivery.releases}
          tracks={stats.tracks}
          missingTable={delivery.missingTable}
          loadError={delivery.error}
          taaliLive={delivery.taaliLive || taaliChecklist.live}
          taaliChecklist={taaliChecklist}
        />
      </div>
    </>
  );
}
