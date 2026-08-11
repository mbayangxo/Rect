import { notFound } from "next/navigation";
import { GenreDetailClient } from "@/app/genres/[slug]/genre-detail-client";
import { loadGenreTracks } from "@/lib/dashboard/genres";
import { loadLikedAmongTrackIds } from "@/lib/dashboard/likes";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function GenreDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const result = await loadGenreTracks(supabase, slug);

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
    <GenreDetailClient
      slug={slug}
      genreName={result.genreName || slug}
      tracks={result.tracks}
      loadError={result.error}
      likedTracks={likedTracks}
      likesReady={Boolean(user) && !likedAmong.missingTable}
    />
  );
}
