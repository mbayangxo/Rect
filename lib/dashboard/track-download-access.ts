import type { SupabaseClient } from "@supabase/supabase-js";
import { isPublishedTrack } from "@/lib/tracks";

export type TrackDownloadAccess =
  | { ok: true; url: string; free: boolean }
  | {
      ok: false;
      code:
        | "not_found"
        | "not_authenticated"
        | "purchase_required"
        | "no_audio";
      error: string;
    };

/**
 * Resolve whether the viewer may download a track file.
 * Free tracks (no download_price) and artist owners always get the URL.
 */
export async function resolveTrackDownloadAccess(
  supabase: SupabaseClient,
  trackId: string,
  viewerId: string | null,
): Promise<TrackDownloadAccess> {
  type TrackAccessRow = {
    id: string;
    artist_id: string | null;
    audio_url: string | null;
    status?: string | null;
    download_price_xof?: number | null;
  };

  const full = await supabase
    .from("tracks")
    .select(
      "id, artist_id, audio_url, status, download_price_xof",
    )
    .eq("id", trackId)
    .maybeSingle();

  let row = full.data as TrackAccessRow | null;
  let error = full.error;

  if (
    error &&
    /download_price_xof|column .* does not exist/i.test(error.message)
  ) {
    const lean = await supabase
      .from("tracks")
      .select("id, artist_id, audio_url, status")
      .eq("id", trackId)
      .maybeSingle();
    row = lean.data as TrackAccessRow | null;
    error = lean.error;
  }

  if (error || !row) {
    return { ok: false, code: "not_found", error: "Track not found." };
  }

  const audioUrl =
    typeof row.audio_url === "string" && row.audio_url.trim()
      ? row.audio_url.trim()
      : null;

  if (!audioUrl) {
    return { ok: false, code: "no_audio", error: "No audio file on this track." };
  }

  const price =
    typeof row.download_price_xof === "number" && row.download_price_xof > 0
      ? row.download_price_xof
      : 0;

  const isOwner = Boolean(viewerId && row.artist_id === viewerId);

  // Non-owners may only download published tracks.
  if (!isOwner && !isPublishedTrack(row)) {
    return { ok: false, code: "not_found", error: "Track not available." };
  }

  if (price <= 0 || isOwner) {
    return { ok: true, url: audioUrl, free: price <= 0 };
  }

  if (!viewerId) {
    return {
      ok: false,
      code: "not_authenticated",
      error: "Sign in to download this track.",
    };
  }

  const { data: purchase } = await supabase
    .from("track_download_purchases")
    .select("id")
    .eq("track_id", trackId)
    .eq("buyer_id", viewerId)
    .eq("status", "confirmed")
    .maybeSingle();

  if (!purchase) {
    return {
      ok: false,
      code: "purchase_required",
      error: `Purchase required — ${price.toLocaleString()} XOF via JOKO.`,
    };
  }

  return { ok: true, url: audioUrl, free: false };
}
