import { StudioMerchManager } from "@/components/studio/studio-merch-manager";
import { loadArtistMerchItems } from "@/lib/dashboard/artist-merch";
import { requireStudioArtist } from "@/lib/studio/require-artist";

export const dynamic = "force-dynamic";

export default async function StudioStorePage() {
  const { supabase, userId } = await requireStudioArtist("/studio/store");
  const merchRes = await loadArtistMerchItems(supabase, userId, {
    includeInactive: true,
  });

  return (
    <>
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[#1DB954]">
        Store
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
        Merch
      </h1>
      <p className="mt-2 text-sm text-white/45">
        Sell clothing, digital goods, and physical merch. Items appear on your
        public portal — fans pay with JOKO mobile money.
      </p>
      <div className="mt-8">
        <StudioMerchManager
          initialItems={merchRes.items}
          storeReady={!merchRes.missingTable}
          storeError={merchRes.error}
          artistPortalHref={`/artists/${userId}`}
        />
      </div>
    </>
  );
}
