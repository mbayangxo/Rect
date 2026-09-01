import { StudioMerchManager } from "@/components/studio/studio-merch-manager";
import { loadArtistMerchItems } from "@/lib/dashboard/artist-merch";
import { requireStudioArtist } from "@/lib/studio/require-artist";
import { trackTitle, type TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

export default async function StudioStorePage() {
  const { supabase, userId } = await requireStudioArtist("/studio/store");
  const merchRes = await loadArtistMerchItems(supabase, userId, {
    includeInactive: true,
  });

  const { data: trackRows } = await supabase
    .from("tracks")
    .select("id, title")
    .eq("artist_id", userId)
    .order("created_at", { ascending: false })
    .limit(80);

  const catalogTracks = ((trackRows ?? []) as TrackRow[]).map((t) => ({
    id: t.id,
    title: trackTitle(t),
  }));

  return (
    <>
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[#1DB954]">
        Store
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
        Merch
      </h1>
      <p className="mt-2 text-sm text-white/45">
        Sell clothing, albums, CDs, vinyl, and physical merch. Song downloads
        are set per track at upload. Purchases feed into RECT SCORE on Charts.
      </p>
      <div className="mt-8">
        <StudioMerchManager
          initialItems={merchRes.items}
          storeReady={!merchRes.missingTable}
          storeError={merchRes.error}
          artistPortalHref={`/artists/${userId}`}
          catalogTracks={catalogTracks}
        />
      </div>
    </>
  );
}
