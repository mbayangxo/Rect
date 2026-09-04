import type { SupabaseClient } from "@supabase/supabase-js";
import { isTaaliLive, taaliSubmitRelease } from "@/lib/taali/client";

export type DistributionStatus =
  | "draft"
  | "queued"
  | "submitted"
  | "live"
  | "failed"
  | "takedown";

export type DistributionRelease = {
  id: string;
  artist_id: string;
  title: string;
  upc: string | null;
  release_date: string | null;
  status: DistributionStatus;
  taali_release_id: string | null;
  cover_art_url: string | null;
  territories: string[];
  dsp_targets: string[];
  smart_link_slug: string | null;
  store_links: Record<string, string>;
  last_error: string | null;
  submitted_at: string | null;
  live_at: string | null;
  created_at: string;
  track_count?: number;
};

function isMissing(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205/i.test(
    message,
  );
}

function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "release"
  );
}

export async function listDistributionReleases(
  supabase: SupabaseClient,
  artistId: string,
): Promise<{
  releases: DistributionRelease[];
  missingTable: boolean;
  error: string | null;
  taaliLive: boolean;
}> {
  const { data, error } = await supabase
    .from("distribution_releases")
    .select(
      "id, artist_id, title, upc, release_date, status, taali_release_id, cover_art_url, territories, dsp_targets, smart_link_slug, store_links, last_error, submitted_at, live_at, created_at",
    )
    .eq("artist_id", artistId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissing(error.message)) {
      return {
        releases: [],
        missingTable: true,
        error: null,
        taaliLive: isTaaliLive(),
      };
    }
    return {
      releases: [],
      missingTable: false,
      error: error.message,
      taaliLive: isTaaliLive(),
    };
  }

  const releases = (data ?? []).map((r) => mapRelease(r as Record<string, unknown>));
  return {
    releases,
    missingTable: false,
    error: null,
    taaliLive: isTaaliLive(),
  };
}

function mapRelease(r: Record<string, unknown>): DistributionRelease {
  const links = r.store_links;
  return {
    id: String(r.id),
    artist_id: String(r.artist_id),
    title: String(r.title ?? "Release"),
    upc: typeof r.upc === "string" ? r.upc : null,
    release_date: typeof r.release_date === "string" ? r.release_date : null,
    status: (r.status as DistributionStatus) || "draft",
    taali_release_id:
      typeof r.taali_release_id === "string" ? r.taali_release_id : null,
    cover_art_url:
      typeof r.cover_art_url === "string" ? r.cover_art_url : null,
    territories: Array.isArray(r.territories)
      ? (r.territories as string[])
      : [],
    dsp_targets: Array.isArray(r.dsp_targets)
      ? (r.dsp_targets as string[])
      : [],
    smart_link_slug:
      typeof r.smart_link_slug === "string" ? r.smart_link_slug : null,
    store_links:
      links && typeof links === "object" && !Array.isArray(links)
        ? (links as Record<string, string>)
        : {},
    last_error: typeof r.last_error === "string" ? r.last_error : null,
    submitted_at:
      typeof r.submitted_at === "string" ? r.submitted_at : null,
    live_at: typeof r.live_at === "string" ? r.live_at : null,
    created_at: String(r.created_at ?? ""),
  };
}

export async function createDistributionRelease(
  supabase: SupabaseClient,
  input: {
    artistId: string;
    title: string;
    upc?: string | null;
    releaseDate?: string | null;
    coverArtUrl?: string | null;
    territories?: string[];
    dspTargets?: string[];
    trackIds: string[];
    isrcs?: Record<string, string>;
  },
): Promise<{ ok: true; releaseId: string } | { ok: false; error: string }> {
  if (input.trackIds.length === 0) {
    return { ok: false, error: "Pick at least one track." };
  }

  const slug = `${slugify(input.title)}-${Date.now().toString(36)}`;
  const { data, error } = await supabase
    .from("distribution_releases")
    .insert({
      artist_id: input.artistId,
      title: input.title.trim().slice(0, 160),
      upc: input.upc?.trim() || null,
      release_date: input.releaseDate || null,
      cover_art_url: input.coverArtUrl || null,
      territories: input.territories?.length ? input.territories : ["WW"],
      dsp_targets: input.dspTargets?.length
        ? input.dspTargets
        : ["spotify", "apple_music", "youtube_music", "deezer", "tidal"],
      smart_link_slug: slug,
      status: "draft",
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    if (error && isMissing(error.message)) {
      return {
        ok: false,
        error: "Run 20260831_artist_os_delivery_suite.sql in Supabase.",
      };
    }
    return { ok: false, error: error?.message || "Could not create release." };
  }

  const releaseId = String(data.id);
  const rows = input.trackIds.map((trackId, i) => ({
    release_id: releaseId,
    track_id: trackId,
    isrc: input.isrcs?.[trackId]?.trim() || null,
    track_number: i + 1,
  }));

  const { error: trackErr } = await supabase
    .from("distribution_release_tracks")
    .insert(rows);

  if (trackErr) {
    await supabase.from("distribution_releases").delete().eq("id", releaseId);
    return { ok: false, error: trackErr.message };
  }

  return { ok: true, releaseId };
}

export async function submitDistributionRelease(
  supabase: SupabaseClient,
  releaseId: string,
  artistId: string,
): Promise<{ ok: true; mode: "live" | "demo"; status: string } | { ok: false; error: string }> {
  const { data: release, error } = await supabase
    .from("distribution_releases")
    .select("*")
    .eq("id", releaseId)
    .eq("artist_id", artistId)
    .maybeSingle();

  if (error || !release) {
    return { ok: false, error: error?.message || "Release not found." };
  }

  const { data: links, error: linkErr } = await supabase
    .from("distribution_release_tracks")
    .select("track_id, isrc, track_number")
    .eq("release_id", releaseId)
    .order("track_number", { ascending: true });

  if (linkErr) return { ok: false, error: linkErr.message };
  const trackIds = (links ?? []).map((l) => String(l.track_id));
  if (trackIds.length === 0) {
    return { ok: false, error: "Release has no tracks." };
  }

  type TrackAudioRow = {
    id: unknown;
    title: unknown;
    audio_url: unknown;
    isrc_code?: unknown;
    punch_status?: unknown;
    punch_audio_url?: unknown;
  };

  let trackRows: TrackAudioRow[] = [];
  {
    const full = await supabase
      .from("tracks")
      .select("id, title, audio_url, isrc_code, punch_status, punch_audio_url")
      .in("id", trackIds)
      .eq("artist_id", artistId);
    if (
      full.error &&
      /punch_status|punch_audio_url|column .* does not exist/i.test(
        full.error.message,
      )
    ) {
      const lean = await supabase
        .from("tracks")
        .select("id, title, audio_url, isrc_code")
        .in("id", trackIds)
        .eq("artist_id", artistId);
      if (lean.error) return { ok: false, error: lean.error.message };
      trackRows = (lean.data ?? []) as TrackAudioRow[];
    } else if (full.error) {
      return { ok: false, error: full.error.message };
    } else {
      trackRows = (full.data ?? []) as TrackAudioRow[];
    }
  }

  const byId = new Map(trackRows.map((t) => [String(t.id), t]));
  const payloadTracks = (links ?? [])
    .map((l) => {
      const t = byId.get(String(l.track_id));
      if (!t) return null;
      const punched =
        String(t.punch_status ?? "") === "ready" &&
        typeof t.punch_audio_url === "string" &&
        t.punch_audio_url.trim()
          ? t.punch_audio_url.trim()
          : null;
      const audioUrl =
        punched || (typeof t.audio_url === "string" ? t.audio_url : null);
      if (!audioUrl) return null;
      return {
        trackId: String(t.id),
        title: String(t.title ?? "Track"),
        isrc:
          (typeof l.isrc === "string" && l.isrc) ||
          (typeof t.isrc_code === "string" ? t.isrc_code : null),
        audioUrl,
        trackNumber: Number(l.track_number) || 1,
      };
    })
    .filter(Boolean) as {
    trackId: string;
    title: string;
    isrc: string | null;
    audioUrl: string;
    trackNumber: number;
  }[];

  if (payloadTracks.length === 0) {
    return { ok: false, error: "Tracks need audio files before DSP delivery." };
  }

  const result = await taaliSubmitRelease({
    releaseId,
    artistId,
    title: String(release.title),
    upc: typeof release.upc === "string" ? release.upc : null,
    releaseDate:
      typeof release.release_date === "string" ? release.release_date : null,
    coverArtUrl:
      typeof release.cover_art_url === "string" ? release.cover_art_url : null,
    territories: Array.isArray(release.territories)
      ? (release.territories as string[])
      : ["WW"],
    dspTargets: Array.isArray(release.dsp_targets)
      ? (release.dsp_targets as string[])
      : [],
    tracks: payloadTracks,
  });

  if (!result.ok) {
    await supabase
      .from("distribution_releases")
      .update({
        status: "failed",
        last_error: result.error,
        updated_at: new Date().toISOString(),
      })
      .eq("id", releaseId);
    return { ok: false, error: result.error };
  }

  const nextStatus = result.status === "queued" ? "queued" : "submitted";
  await supabase
    .from("distribution_releases")
    .update({
      status: nextStatus,
      taali_release_id: result.taaliReleaseId,
      submitted_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", releaseId);

  await supabase.from("distribution_delivery_events").insert({
    release_id: releaseId,
    event_type: result.mode === "demo" ? "demo_queued" : "submitted",
    payload: { taali_release_id: result.taaliReleaseId, mode: result.mode },
  });

  return { ok: true, mode: result.mode, status: nextStatus };
}
