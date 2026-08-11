import { redirect } from "next/navigation";
import { TipsClient } from "@/app/tips/tips-client";
import { loadMyTips } from "@/lib/dashboard/tips";
import { createClient } from "@/lib/supabase/server";
import { isDemoTrack, type TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

export default async function TipsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/tips");
  }

  const result = await loadMyTips(supabase, user.id);
  const trackIds = [
    ...new Set(
      result.tips
        .map((t) => t.track_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const tracksRes =
    trackIds.length > 0
      ? await supabase
          .from("tracks")
          .select(
            "id, title, artist_id, genre, status, audio_url, cover_art_url, play_count, duration_secs",
          )
          .in("id", trackIds)
      : { data: [] as TrackRow[], error: null };

  const tipTracks: Record<string, TrackRow> = {};
  for (const row of (tracksRes.data ?? []) as TrackRow[]) {
    if (!row?.id || isDemoTrack(row)) continue;
    tipTracks[row.id] = row;
  }

  return (
    <TipsClient
      tips={result.tips}
      totalXof={result.totalXof}
      loadError={result.error}
      missingTable={result.missingTable}
      tipTracks={tipTracks}
    />
  );
}
