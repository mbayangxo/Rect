import type { Delivery, Release, Track } from "@/lib/catalog/types";
import { validateReleaseMetadata } from "@/lib/metadata/validate-release";
import type {
  DistributionProvider,
  ProviderResult,
  SubmitReleaseResult,
  ValidationResult,
} from "@/lib/providers/types";

const demoQueue = new Map<string, Delivery["status"]>();

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

export const demoProvider: DistributionProvider = {
  id: "demo",
  configured: true,
  capabilities: ["submit", "status", "preview"],

  validateRelease(release, tracks) {
    return validateWithMetadata(release, tracks);
  },

  async submitRelease(release, tracks) {
    const validation = validateWithMetadata(release, tracks);
    if (!validation.ok) {
      return {
        ok: false,
        code: "validation_failed",
        message: validation.issues.join(" "),
      };
    }

    const providerRef = `demo-${release.id}`;
    demoQueue.set(providerRef, "queued");

    return {
      ok: true,
      data: {
        providerRef,
        status: "queued",
        mode: "demo",
      },
    };
  },

  async getStatus(delivery) {
    const ref = delivery.provider_ref;
    if (!ref?.startsWith("demo-")) {
      return {
        ok: true,
        data: {
          status: delivery.status,
          providerRef: ref ?? undefined,
          message: "Demo provider never promotes deliveries to live.",
        },
      };
    }

    const status = demoQueue.get(ref) ?? delivery.status;
    return {
      ok: true,
      data: {
        status,
        providerRef: ref,
        message: "Demo queue — not delivered to a live DSP.",
      },
    };
  },
};

export function resetDemoQueue(): void {
  demoQueue.clear();
}
