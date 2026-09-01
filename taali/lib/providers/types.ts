import type { Delivery, Release, Track } from "@/lib/catalog/types";

export type ProviderCapability = "submit" | "status" | "takedown" | "preview";

export type ProviderErrorCode =
  | "not_configured"
  | "validation_failed"
  | "provider_error";

export type ProviderResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ProviderErrorCode; message: string };

export type SubmitReleaseResult = {
  providerRef: string;
  status: "queued" | "submitted" | "processing";
  mode: "demo" | "live";
};

export type DeliveryStatusResult = {
  status: Delivery["status"];
  providerRef?: string;
  message?: string;
};

export type ValidationResult = {
  ok: boolean;
  issues: string[];
};

export interface DistributionProvider {
  id: string;
  configured: boolean;
  capabilities: ProviderCapability[];
  validateRelease(
    release: Release,
    tracks: Track[],
  ): Promise<ValidationResult> | ValidationResult;
  submitRelease(
    release: Release,
    tracks: Track[],
  ): Promise<ProviderResult<SubmitReleaseResult>>;
  getStatus(delivery: Delivery): Promise<ProviderResult<DeliveryStatusResult>>;
}
