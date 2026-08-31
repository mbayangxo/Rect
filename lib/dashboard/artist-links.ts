import type { SupabaseClient } from "@supabase/supabase-js";

export type ArtistLink = {
  linkedArtistId: string | null;
  linkedListenerId: string | null;
  artistName: string | null;
};

export async function loadArtistLink(
  supabase: SupabaseClient,
  userId: string,
): Promise<ArtistLink> {
  const empty: ArtistLink = {
    linkedArtistId: null,
    linkedListenerId: null,
    artistName: null,
  };
  const { data, error } = await supabase
    .from("users")
    .select("linked_artist_id, linked_listener_id")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return empty;

  const linkedArtistId =
    typeof data.linked_artist_id === "string" ? data.linked_artist_id : null;
  const linkedListenerId =
    typeof data.linked_listener_id === "string" ? data.linked_listener_id : null;

  let artistName: string | null = null;
  if (linkedArtistId) {
    const artist = await supabase
      .from("users")
      .select("display_name")
      .eq("id", linkedArtistId)
      .maybeSingle();
    if (typeof artist.data?.display_name === "string") {
      artistName = artist.data.display_name;
    }
  }

  return { linkedArtistId, linkedListenerId, artistName };
}
