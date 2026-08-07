export type TrackRow = {
  id: string;
  title: string | null;
  audio_url: string | null;
  cover_art_url?: string | null;
  genre: string | null;
  artist_id: string | null;
  duration_secs?: number | null;
  status?: string | null;
  created_at?: string | null;
  artist_name?: string | null;
};

export function trackTitle(t: TrackRow) {
  return t.title?.trim() || "Untitled";
}

export function trackArtist(t: TrackRow) {
  return t.artist_name?.trim() || "Unknown artist";
}

export const TRACKS_BUCKET = "tracks";
