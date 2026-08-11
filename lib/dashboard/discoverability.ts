import {
  normalizeTrackGenre,
  normalizeTrackLanguage,
} from "@/lib/cultural-options";

export type DiscoverabilityIssue = "places" | "genre" | "language";

export type DiscoverabilityCheck =
  | { ok: true; genre: string; language: string }
  | {
      ok: false;
      issues: DiscoverabilityIssue[];
      error: string;
      code: "discoverability";
    };

function asPlaceList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Human-readable hard-fail when a track cannot go live for discovery. */
export function formatDiscoverabilityError(
  issues: DiscoverabilityIssue[],
): string {
  const parts: string[] = [];
  if (issues.includes("places")) {
    parts.push("set at least one place in Studio → My portal");
  }
  if (issues.includes("genre")) {
    parts.push("pick a genre");
  }
  if (issues.includes("language")) {
    parts.push("pick a language");
  }
  if (parts.length === 0) {
    return "Track is missing discovery fields.";
  }
  if (parts.length === 1) {
    return `Before going live, ${parts[0]}.`;
  }
  if (parts.length === 2) {
    return `Before going live, ${parts[0]} and ${parts[1]}.`;
  }
  return `Before going live, ${parts[0]}, ${parts[1]}, and ${parts[2]}.`;
}

/**
 * Live catalog + Charts/Wave hubs need place (artist), genre, and language.
 * Soft “published without them” lied — boards simply never saw the track.
 */
export function checkLiveDiscoverability(input: {
  genre?: string | null;
  language?: string | null;
  countries?: unknown;
}): DiscoverabilityCheck {
  const genre = normalizeTrackGenre(input.genre);
  const language = normalizeTrackLanguage(input.language);
  const places = asPlaceList(input.countries);
  const issues: DiscoverabilityIssue[] = [];
  if (places.length < 1) issues.push("places");
  if (!genre) issues.push("genre");
  if (!language) issues.push("language");
  if (issues.length > 0) {
    return {
      ok: false,
      issues,
      error: formatDiscoverabilityError(issues),
      code: "discoverability",
    };
  }
  return { ok: true, genre: genre!, language: language! };
}
