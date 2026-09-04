export type TrackRow = {
  id: string;
  title: string | null;
  audio_url: string | null;
  cover_art_url?: string | null;
  genre: string | null;
  language?: string | null;
  artist_id: string | null;
  duration_secs?: number | null;
  status?: string | null;
  created_at?: string | null;
  artist_name?: string | null;
  /** Paid download price in XOF; null/0 = free offline download. */
  download_price_xof?: number | null;
  /** Plain-text lyrics; null/empty = none. */
  lyrics?: string | null;
  /** When the track appears on New / New Sounds; null = immediate. */
  launch_at?: string | null;
  isrc_code?: string | null;
  upc_code?: string | null;
  /** Upload QC: pending | pass | warn | fail */
  qc_status?: string | null;
  qc_lufs_integrated?: number | null;
  qc_true_peak_dbtp?: number | null;
  qc_issues?: unknown;
  /** music (default) or podcast (Hearing Aids). */
  content_kind?: string | null;
  /** RECT Punch mastering status. */
  punch_status?: string | null;
  punch_audio_url?: string | null;
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

/** Canonical DB value for a public catalog track (see tracks_status_check). */
export const TRACK_STATUS_LIVE = "live";
/** Draft / not on Home or Charts. */
export const TRACK_STATUS_PENDING = "pending";

/**
 * Live on discovery when status is live/published/null.
 * Explicit pending/draft/unpublished stay in the artist library only.
 *
 * Supabase check allows: pending | live (published is accepted as an alias).
 */
export function isPublishedTrack(t: Pick<TrackRow, "status">) {
  const s = (t.status || TRACK_STATUS_LIVE).trim().toLowerCase();
  return s !== "pending" && s !== "draft" && s !== "unpublished";
}

/** Public discovery: published and past launch date (or unscheduled). */
export function isTrackLaunched(t: Pick<TrackRow, "launch_at">) {
  if (!t.launch_at) return true;
  const at = new Date(t.launch_at).getTime();
  if (Number.isNaN(at)) return true;
  return at <= Date.now();
}

export function isPubliclyDiscoverable(
  t: Pick<TrackRow, "status" | "launch_at">,
) {
  return isPublishedTrack(t) && isTrackLaunched(t);
}

/** Map API/UI publish intents onto the DB-safe write value. */
export function trackStatusForWrite(
  intent: "live" | "pending" | "published" | "draft" | "unpublished" | string,
): typeof TRACK_STATUS_LIVE | typeof TRACK_STATUS_PENDING {
  const s = intent.trim().toLowerCase();
  if (s === "pending" || s === "draft" || s === "unpublished") {
    return TRACK_STATUS_PENDING;
  }
  return TRACK_STATUS_LIVE;
}

/**
 * Push live-catalog filters into a tracks query BEFORE .limit().
 * Prevents pending drafts from crowding out real uploads.
 * Matches isPublishedTrack: live | published | null (legacy).
 * Music discovery only — Hearing Aids podcasts stay on /hearing-aids.
 * Pass includePodcasts when content_kind column is missing (fallback retry).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withLiveCatalogTracks(
  query: any,
  opts?: { includePodcasts?: boolean },
) {
  let q = query
    .or("status.eq.live,status.eq.published,status.is.null")
    .not("audio_url", "is", null);
  if (!opts?.includePodcasts) {
    q = q.or("content_kind.is.null,content_kind.eq.music");
  }
  return q;
}

export function isMusicTrack(t: Pick<TrackRow, "content_kind">) {
  const k = (t.content_kind || "music").toLowerCase();
  return k !== "podcast";
}

export function isPodcastTrack(t: Pick<TrackRow, "content_kind">) {
  return (t.content_kind || "").toLowerCase() === "podcast";
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

/** Format duration_secs as m:ss / h:mm:ss; empty if unknown. */
export function formatTrackDuration(
  secs: number | null | undefined,
): string {
  const n = Number(secs);
  if (!Number.isFinite(n) || n <= 0) return "";
  const total = Math.round(n);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

export const TRACKS_BUCKET = "tracks";
