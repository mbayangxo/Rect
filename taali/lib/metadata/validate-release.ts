import type { Release, Track } from "@/lib/catalog/types";

export type MetadataValidationResult = {
  ok: boolean;
  issues: string[];
};

const UPC_PATTERN = /^\d{12,14}$/;
const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pushIfEmpty(
  issues: string[],
  value: string | null | undefined,
  label: string,
) {
  if (!value?.trim()) {
    issues.push(`${label} is required.`);
  }
}

function pushIfInvalidPattern(
  issues: string[],
  value: string | null | undefined,
  pattern: RegExp,
  label: string,
) {
  if (!value) return;
  if (!pattern.test(value.trim())) {
    issues.push(`${label} has an invalid format.`);
  }
}

/**
 * Validates release + track metadata before provider submission.
 */
export function validateReleaseMetadata(
  release: Pick<
    Release,
    | "title"
    | "artist_external_id"
    | "upc"
    | "release_date"
    | "cover_url"
    | "territories"
    | "dsp_targets"
  >,
  tracks: Pick<
    Track,
    "title" | "audio_url" | "track_number" | "isrc" | "external_id"
  >[],
): MetadataValidationResult {
  const issues: string[] = [];

  pushIfEmpty(issues, release.title, "Release title");
  pushIfEmpty(issues, release.artist_external_id, "Artist external id");
  pushIfEmpty(issues, release.cover_url, "Cover art URL");

  if (!release.territories?.length) {
    issues.push("At least one territory is required.");
  }

  if (!release.dsp_targets?.length) {
    issues.push("At least one DSP target is required.");
  }

  pushIfInvalidPattern(issues, release.upc, UPC_PATTERN, "UPC");
  pushIfInvalidPattern(issues, release.release_date, DATE_PATTERN, "Release date");

  if (!tracks.length) {
    issues.push("At least one track is required.");
  }

  const trackNumbers = new Set<number>();

  tracks.forEach((track, index) => {
    const label = `Track ${index + 1}`;

    pushIfEmpty(issues, track.title, `${label} title`);
    pushIfEmpty(issues, track.audio_url, `${label} audio URL`);

    if (!Number.isInteger(track.track_number) || track.track_number < 1) {
      issues.push(`${label} track number must be a positive integer.`);
    } else if (trackNumbers.has(track.track_number)) {
      issues.push(`${label} has a duplicate track number (${track.track_number}).`);
    } else {
      trackNumbers.add(track.track_number);
    }

    pushIfInvalidPattern(issues, track.isrc, ISRC_PATTERN, `${label} ISRC`);
  });

  return { ok: issues.length === 0, issues };
}
