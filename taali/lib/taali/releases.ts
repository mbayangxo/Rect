import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateReleaseBody,
  ReleaseRow,
  ReleaseTrackRow,
  ReleaseType,
  TrackInput,
} from "./types";

function normalizeReleaseType(value: string | undefined): ReleaseType {
  const raw = (value || "single").toLowerCase();
  if (raw === "ep" || raw === "album" || raw === "compilation") return raw;
  return "single";
}

function normalizeTracks(tracks: TrackInput[] | undefined): TrackInput[] {
  if (!tracks?.length) return [];
  return tracks.map((track, index) => ({
    title: track.title?.trim() || `Track ${index + 1}`,
    track_number: track.track_number ?? index + 1,
    isrc: track.isrc ?? null,
    audio_url: track.audio_url ?? null,
    rect_external_id: track.rect_external_id ?? track.external_id ?? null,
    duration_ms: track.duration_ms ?? null,
  }));
}

export function mapCreateBody(body: CreateReleaseBody) {
  const rectExternalId = body.rect_external_id ?? body.external_id ?? null;
  const rectArtistExternalId =
    body.rect_artist_external_id ?? body.artist_external_id ?? null;

  return {
    title: body.title.trim(),
    release_type: normalizeReleaseType(body.release_type),
    organization_id: body.organization_id,
    rect_external_id: rectExternalId,
    rect_artist_external_id: rectArtistExternalId,
    upc: body.upc ?? null,
    release_date: body.release_date ?? null,
    cover_url: body.cover_url ?? null,
    territories: body.territories ?? [],
    dsp_targets: body.dsp_targets ?? [],
    status: "draft" as const,
    validation_status: "pending",
    validation_issues: [],
  };
}

export async function listReleases(
  admin: SupabaseClient,
  organizationId?: string | null,
) {
  let query = admin
    .from("releases")
    .select("*")
    .order("created_at", { ascending: false });

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;
  return { data: (data ?? []) as ReleaseRow[], error };
}

export async function getReleaseWithTracks(admin: SupabaseClient, id: string) {
  const { data: release, error: releaseError } = await admin
    .from("releases")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (releaseError) return { release: null, tracks: [], error: releaseError };
  if (!release) return { release: null, tracks: [], error: null };

  const { data: tracks, error: tracksError } = await admin
    .from("release_tracks")
    .select("*")
    .eq("release_id", id)
    .order("track_number", { ascending: true });

  return {
    release: release as ReleaseRow,
    tracks: (tracks ?? []) as ReleaseTrackRow[],
    error: tracksError,
  };
}

export async function createRelease(
  admin: SupabaseClient,
  body: CreateReleaseBody,
) {
  const releaseRow = mapCreateBody(body);
  const tracks = normalizeTracks(body.tracks);

  const { data: release, error: releaseError } = await admin
    .from("releases")
    .insert(releaseRow)
    .select("*")
    .single();

  if (releaseError || !release) {
    return { release: null, tracks: [], error: releaseError };
  }

  if (!tracks.length) {
    return {
      release: release as ReleaseRow,
      tracks: [] as ReleaseTrackRow[],
      error: null,
    };
  }

  const trackRows = tracks.map((track) => ({
    release_id: release.id,
    title: track.title,
    track_number: track.track_number ?? 1,
    isrc: track.isrc ?? null,
    audio_url: track.audio_url ?? null,
    rect_external_id: track.rect_external_id ?? null,
    duration_ms: track.duration_ms ?? null,
  }));

  const { data: insertedTracks, error: tracksError } = await admin
    .from("release_tracks")
    .insert(trackRows)
    .select("*");

  return {
    release: release as ReleaseRow,
    tracks: (insertedTracks ?? []) as ReleaseTrackRow[],
    error: tracksError,
  };
}
