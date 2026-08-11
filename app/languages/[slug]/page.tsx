import { notFound } from "next/navigation";
import { LanguageDetailClient } from "@/app/languages/[slug]/language-detail-client";
import { loadLikedAmongTrackIds } from "@/lib/dashboard/likes";
import { loadLanguageTracks } from "@/lib/dashboard/languages";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function LanguageDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const result = await loadLanguageTracks(supabase, slug);

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
    <LanguageDetailClient
      slug={slug}
      languageName={result.languageName || slug}
      tracks={result.tracks}
      loadError={result.error}
      likedTracks={likedTracks}
      likesReady={Boolean(user) && !likedAmong.missingTable}
    />
  );
}
