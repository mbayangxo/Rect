import { notFound } from "next/navigation";
import { PlaylistDetailClient } from "@/app/playlists/[id]/playlist-detail-client";
import { loadPlaylistDetail } from "@/lib/dashboard/playlists";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function PlaylistDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await loadPlaylistDetail(supabase, user?.id ?? null, id);

  if (result.notFound) notFound();

  return (
    <PlaylistDetailClient
      playlist={result.playlist}
      loadError={result.error}
      missingTable={result.missingTable}
    />
  );
}
