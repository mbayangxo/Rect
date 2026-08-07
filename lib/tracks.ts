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

/** Seed / fixture demos — never show on public landing or charts. */
export function isDemoTrack(t: TrackRow) {
  const title = t.title?.trim() || "";
  const artist = t.artist_name?.trim() || "";
  return (
    /SoundHelix/i.test(title) ||
    /^SoundHelix(\s+Demo)?$/i.test(title.replace(/\s*[·•|]\s*RECT\s*$/i, "").trim()) ||
    /Demo\s*Track/i.test(title) ||
    /^RECT(\s+Demo)?$/i.test(artist) ||
    /^SoundHelix$/i.test(artist)
  );
}

export function trackTitle(t: TrackRow) {
  const raw = t.title?.trim() || "Untitled";
  return raw.replace(/\s*[·•|]\s*RECT\s*$/i, "").trim() || "Untitled";
}

export function trackArtist(t: TrackRow) {
  const name = t.artist_name?.trim();
  if (name) return name;
  return "Unknown artist";
}

export const TRACKS_BUCKET = "tracks";
