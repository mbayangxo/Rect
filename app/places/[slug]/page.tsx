import { notFound } from "next/navigation";
import { PlaceDetailClient } from "@/app/places/[slug]/place-detail-client";
import { loadLikedAmongTrackIds } from "@/lib/dashboard/likes";
import { loadPlaceDetail } from "@/lib/dashboard/places";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function PlaceDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const result = await loadPlaceDetail(supabase, slug);

  if (result.notFound) notFound();

  const likedAmong =
    user && result.tracks.length > 0
      ? await loadLikedAmongTrackIds(
          supabase,
          user.id,
          result.tracks.map((t) => t.id),
        )
      : { likedIds: [] as string[], missingTable: true };
  const likedTracks: Record<string, boolean> = {};
  for (const id of likedAmong.likedIds) {
    likedTracks[id] = true;
  }

  return (
    <PlaceDetailClient
      slug={slug}
      placeName={result.placeName || slug}
      artists={result.artists}
      tracks={result.tracks}
      loadError={result.error}
      likedTracks={likedTracks}
      likesReady={Boolean(user) && !likedAmong.missingTable}
    />
  );
}
