import type { Release, Track } from "@/lib/catalog/types";
import { validateReleaseMetadata } from "@/lib/metadata/validate-release";
import type {
  DistributionProvider,
  ProviderResult,
  ValidationResult,
} from "@/lib/providers/types";

function notConfigured(message: string): ProviderResult<never> {
  return { ok: false, code: "not_configured", message };
}

function validateWithMetadata(
  release: Release,
  tracks: Track[],
): ValidationResult {
  const metadata = validateReleaseMetadata(release, tracks);
  if (!metadata.ok) {
    return { ok: false, issues: metadata.issues };
  }
  return { ok: true, issues: [] };
}

export const appleDirectProvider: DistributionProvider = {
  id: "apple-direct",
  configured: false,
  capabilities: ["submit", "status", "takedown"],

  validateRelease(release, tracks) {
    return validateWithMetadata(release, tracks);
  },

  async submitRelease() {
    return notConfigured(
      "Apple Music direct delivery is not available in Phase 1. Use the demo or LabelGrid partner rail.",
    );
  },

  async getStatus() {
    return notConfigured(
      "Apple Music direct status checks are not available in Phase 1.",
    );
  },
};
