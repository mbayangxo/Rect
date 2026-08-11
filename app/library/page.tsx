import { redirect } from "next/navigation";
import { LibraryClient } from "@/app/library/library-client";
import { loadLikedTracks } from "@/lib/dashboard/likes";
import { loadFollowedPlaylists } from "@/lib/dashboard/playlist-follows";
import {
  loadFirstTracksForPlaylists,
  loadUserPlaylists,
} from "@/lib/dashboard/playlists";
import { createClient } from "@/lib/supabase/server";
import type { TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/library");
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  let likesHidden = true; // default off — matches Profile copy

  const { data: privacyRow, error: privacyErr } = await supabase
    .from("users")
    .select("privacy_show_likes")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !privacyErr ||
    !/privacy_show_likes|column .* does not exist/i.test(privacyErr.message)
  ) {
    const fromDb = privacyRow?.privacy_show_likes;
    const fromMeta = meta.privacy_show_likes;
    likesHidden =
      fromDb !== true && !(fromDb == null && fromMeta === true);
  }

  const [likes, owned, saved] = await Promise.all([
    loadLikedTracks(supabase, user.id),
    loadUserPlaylists(supabase, user.id),
    loadFollowedPlaylists(supabase, user.id),
  ]);

  const playlistIds = [
    ...new Set([
      ...owned.playlists.map((p) => p.id),
      ...saved.playlists.map((p) => p.id),
    ]),
  ].filter(Boolean);
  const previews = await loadFirstTracksForPlaylists(supabase, playlistIds);
  const playlistPreviewTracks: Record<string, TrackRow> =
    previews.byPlaylistId;

  return (
    <LibraryClient
      initialTracks={likes.tracks}
      loadError={likes.error}
      missingTable={likes.missingTable}
      likesHidden={likesHidden}
      ownedPlaylists={owned.playlists}
      ownedError={owned.error}
      ownedMissing={owned.missingTable}
      savedPlaylists={saved.playlists}
      savedError={saved.error}
      savedMissing={saved.missingTable}
      playlistPreviewTracks={playlistPreviewTracks}
    />
  );
}
