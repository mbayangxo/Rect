import type { Delivery, Release, Track } from "@/lib/catalog/types";
import { validateReleaseMetadata } from "@/lib/metadata/validate-release";
import type {
  DistributionProvider,
  ProviderResult,
  ValidationResult,
} from "@/lib/providers/types";

function isLabelGridConfigured(): boolean {
  const url = process.env.LABELGRID_API_URL?.trim();
  return Boolean(url && url.startsWith("http"));
}

const NOT_CONFIGURED_MESSAGE =
  "LabelGrid partner rail is not configured. Set LABELGRID_API_URL to enable.";

function notConfigured(): ProviderResult<never> {
  return {
    ok: false,
    code: "not_configured",
    message: NOT_CONFIGURED_MESSAGE,
  };
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

export const labelGridProvider: DistributionProvider = {
  id: "labelgrid",
  get configured() {
    return isLabelGridConfigured();
  },
  capabilities: ["submit", "status", "takedown"],

  validateRelease(release, tracks) {
    if (!isLabelGridConfigured()) {
      return { ok: false, issues: [NOT_CONFIGURED_MESSAGE] };
    }
    return validateWithMetadata(release, tracks);
  },

  async submitRelease(release, tracks) {
    if (!isLabelGridConfigured()) {
      return notConfigured();
    }

    const validation = validateWithMetadata(release, tracks);
    if (!validation.ok) {
      return {
        ok: false,
        code: "validation_failed",
        message: validation.issues.join(" "),
      };
    }

    // Phase 1: partner HTTP integration lands in a follow-up.
    return {
      ok: false,
      code: "not_configured",
      message:
        "LabelGrid credentials are present but the HTTP client is not wired yet.",
    };
  },

  async getStatus(delivery: Delivery) {
    if (!isLabelGridConfigured()) {
      return notConfigured();
    }

    return {
      ok: true,
      data: {
        status: delivery.status,
        providerRef: delivery.provider_ref ?? undefined,
      },
    };
  },
};
