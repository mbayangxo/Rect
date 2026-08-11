import { redirect } from "next/navigation";
import { PlaylistsClient } from "@/app/playlists/playlists-client";
import { loadCollaborativePlaylists } from "@/lib/dashboard/playlist-collaborators";
import { loadFollowedPlaylists } from "@/lib/dashboard/playlist-follows";
import {
  loadFirstTracksForPlaylists,
  loadUserPlaylists,
} from "@/lib/dashboard/playlists";
import { createClient } from "@/lib/supabase/server";
import type { TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

export default async function PlaylistsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/playlists");
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  let savesHidden = true;

  const { data: privacyRow, error: privacyErr } = await supabase
    .from("users")
    .select("privacy_show_saves")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !privacyErr ||
    !/privacy_show_saves|column .* does not exist/i.test(privacyErr.message)
  ) {
    const fromDb = privacyRow?.privacy_show_saves;
    const fromMeta = meta.privacy_show_saves;
    savesHidden =
      fromDb !== true && !(fromDb == null && fromMeta === true);
  }

  const [result, saved, collab] = await Promise.all([
    loadUserPlaylists(supabase, user.id),
    loadFollowedPlaylists(supabase, user.id),
    loadCollaborativePlaylists(supabase, user.id),
  ]);

  const playlistIds = [
    ...new Set([
      ...result.playlists.map((p) => p.id),
      ...collab.playlists.map((p) => p.id),
      ...saved.playlists.map((p) => p.id),
    ]),
  ].filter(Boolean);
  const previews = await loadFirstTracksForPlaylists(supabase, playlistIds);
  const playlistPreviewTracks: Record<string, TrackRow> = previews.byPlaylistId;

  return (
    <PlaylistsClient
      initialPlaylists={result.playlists}
      collabPlaylists={collab.playlists}
      savedPlaylists={saved.playlists}
      loadError={result.error || saved.error || collab.error}
      missingTable={result.missingTable}
      followsMissing={saved.missingTable}
      collabMissing={collab.missingTable}
      savesHidden={savesHidden}
      playlistPreviewTracks={playlistPreviewTracks}
    />
  );
}
