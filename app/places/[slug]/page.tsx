import { notFound } from "next/navigation";
import { PlaceDetailClient } from "@/app/places/[slug]/place-detail-client";
import { loadPlaceDetail } from "@/lib/dashboard/places";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function PlaceDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const result = await loadPlaceDetail(supabase, slug);

  if (result.notFound) notFound();

  return (
    <PlaceDetailClient
      slug={slug}
      placeName={result.placeName || slug}
      artists={result.artists}
      tracks={result.tracks}
      loadError={result.error}
    />
  );
}
