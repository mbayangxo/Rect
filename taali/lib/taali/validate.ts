import type { ReleaseTrackRow, ReleaseRow, ValidationIssue } from "./types";

const RELEASE_TYPES = new Set(["single", "ep", "album", "compilation"]);
const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i;
const UPC_RE = /^\d{12,14}$/;

export function validateReleaseMetadata(
  release: Pick<
    ReleaseRow,
    | "title"
    | "release_type"
    | "upc"
    | "release_date"
    | "cover_url"
    | "territories"
    | "dsp_targets"
  >,
  tracks: Pick<
    ReleaseTrackRow,
    "title" | "track_number" | "isrc" | "audio_url" | "duration_ms"
  >[],
): { valid: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];

  if (!release.title?.trim()) {
    issues.push({
      field: "title",
      message: "Release title is required.",
      severity: "error",
    });
  }

  if (!RELEASE_TYPES.has(release.release_type)) {
    issues.push({
      field: "release_type",
      message: "Release type must be single, ep, album, or compilation.",
      severity: "error",
    });
  }

  if (release.upc && !UPC_RE.test(release.upc.replace(/\s/g, ""))) {
    issues.push({
      field: "upc",
      message: "UPC must be 12–14 digits.",
      severity: "error",
    });
  }

  if (!tracks.length) {
    issues.push({
      field: "tracks",
      message: "At least one track is required.",
      severity: "error",
    });
  }

  const trackNumbers = new Set<number>();
  for (const track of tracks) {
    if (!track.title?.trim()) {
      issues.push({
        field: `tracks[${track.track_number}].title`,
        message: "Track title is required.",
        severity: "error",
      });
    }

    if (track.isrc && !ISRC_RE.test(track.isrc.replace(/[-\s]/g, ""))) {
      issues.push({
        field: `tracks[${track.track_number}].isrc`,
        message: "ISRC format looks invalid (CC-XXX-YY-NNNNN).",
        severity: "warning",
      });
    }

    if (!track.audio_url?.trim()) {
      issues.push({
        field: `tracks[${track.track_number}].audio_url`,
        message: "Audio URL is required for delivery.",
        severity: "error",
      });
    }

    trackNumbers.add(track.track_number);
  }

  if (release.release_type === "single" && tracks.length > 3) {
    issues.push({
      field: "release_type",
      message: "Single releases typically have 1–3 tracks.",
      severity: "warning",
    });
  }

  if (!release.cover_url?.trim()) {
    issues.push({
      field: "cover_url",
      message: "Cover art URL is recommended before delivery.",
      severity: "warning",
    });
  }

  if (!release.territories?.length) {
    issues.push({
      field: "territories",
      message: "No territories selected — worldwide assumed.",
      severity: "warning",
    });
  }

  if (!release.dsp_targets?.length) {
    issues.push({
      field: "dsp_targets",
      message: "No DSP targets selected.",
      severity: "warning",
    });
  }

  const valid = !issues.some((i) => i.severity === "error");
  return { valid, issues };
}
