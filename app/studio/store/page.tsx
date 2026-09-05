import { StudioStoreClient } from "@/components/studio/studio-store-client";
import { loadArtistMerchItems } from "@/lib/dashboard/artist-merch";
import { requireStudioArtist } from "@/lib/studio/require-artist";
import { trackTitle, type TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

async function loadStoreLayout(
  supabase: Awaited<ReturnType<typeof requireStudioArtist>>["supabase"],
  userId: string,
): Promise<"grid" | "rail" | "featured"> {
  const { data, error } = await supabase
    .from("users")
    .select("artist_store_layout")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return "grid";
  const layout = (data as { artist_store_layout?: string }).artist_store_layout;
  if (layout === "rail" || layout === "featured" || layout === "grid") {
    return layout;
  }
  return "grid";
}

export default async function StudioStorePage() {
  const { supabase, userId } = await requireStudioArtist("/studio/store");
  const merchRes = await loadArtistMerchItems(supabase, userId, {
    includeInactive: true,
  });
  const layout = await loadStoreLayout(supabase, userId);

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
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[var(--rect)]">
        RECT Artist · Store
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
        Decorate store
      </h1>
      <p className="mt-2 text-sm text-white/45">
        Pick a layout template, seed starter merch, then finish photos and go
        live. Fans buy with JOKO on your World page.
      </p>
      <div className="mt-8">
        <StudioStoreClient
          initialItems={merchRes.items}
          storeReady={!merchRes.missingTable}
          storeError={merchRes.error}
          artistPortalHref={`/artists/${userId}`}
          catalogTracks={catalogTracks}
          initialLayout={layout}
        />
      </div>
    </>
  );
}
