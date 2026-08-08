import { notFound } from "next/navigation";
import { GenreDetailClient } from "@/app/genres/[slug]/genre-detail-client";
import { loadGenreTracks } from "@/lib/dashboard/genres";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function GenreDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const result = await loadGenreTracks(supabase, slug);

  if (result.notFound) notFound();

  return (
    <GenreDetailClient
      slug={slug}
      genreName={result.genreName || slug}
      tracks={result.tracks}
      loadError={result.error}
    />
  );
}
