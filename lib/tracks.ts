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
  const raw = t.title?.trim() || "Untitled";
  // Clean seeded demo labels like "SoundHelix Demo · RECT"
  return raw
    .replace(/\s*[·•|]\s*RECT\s*$/i, "")
    .replace(/^SoundHelix\s+Demo$/i, "Demo Track")
    .trim() || "Untitled";
}

export function trackArtist(t: TrackRow) {
  const name = t.artist_name?.trim();
  if (name && !/^RECT Demo$/i.test(name)) return name;
  const title = t.title?.trim() || "";
  if (/SoundHelix/i.test(title)) return "SoundHelix";
  return name || "Unknown artist";
}

export const TRACKS_BUCKET = "tracks";
