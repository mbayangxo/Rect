import type { SupabaseClient } from "@supabase/supabase-js";
import type { Delivery, Release, Track } from "@/lib/catalog/types";
import { writeAuditLog } from "@/lib/audit/log";
import { validateReleaseMetadata } from "@/lib/metadata/validate-release";
import { getProvider } from "@/lib/providers/registry";

export type SubmitReleaseToProviderResult =
  | { ok: true; delivery: Delivery; release: Release }
  | {
      ok: false;
      error: string;
      issues?: string[];
      code?: "not_found" | "not_configured" | "validation_failed" | "provider_error";
    };

async function fetchRelease(
  supabase: SupabaseClient,
  releaseId: string,
): Promise<Release | null> {
  const { data, error } = await supabase
    .from("releases")
    .select("*")
    .eq("id", releaseId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load release: ${error.message}`);
  }

  return (data as Release | null) ?? null;
}

async function fetchTracks(
  supabase: SupabaseClient,
  releaseId: string,
): Promise<Track[]> {
  const { data, error } = await supabase
    .from("tracks")
    .select("*")
    .eq("release_id", releaseId)
    .order("track_number", { ascending: true });

  if (error) {
    throw new Error(`Failed to load tracks: ${error.message}`);
  }

  return (data as Track[]) ?? [];
}

async function upsertDelivery(
  supabase: SupabaseClient,
  releaseId: string,
  providerId: string,
  patch: Partial<Delivery>,
): Promise<Delivery> {
  const { data: existing, error: existingError } = await supabase
    .from("deliveries")
    .select("*")
    .eq("release_id", releaseId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load delivery: ${existingError.message}`);
  }

  const now = new Date().toISOString();

  if (existing) {
    const { data, error } = await supabase
      .from("deliveries")
      .update({ ...patch, updated_at: now })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to update delivery: ${error.message}`);
    }

    return data as Delivery;
  }

  const { data, error } = await supabase
    .from("deliveries")
    .insert({
      release_id: releaseId,
      provider_id: providerId,
      status: "pending",
      provider_ref: null,
      mode: null,
      last_error: null,
      submitted_at: null,
      live_at: null,
      created_at: now,
      updated_at: now,
      ...patch,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create delivery: ${error.message}`);
  }

  return data as Delivery;
}

async function updateReleaseStatus(
  supabase: SupabaseClient,
  releaseId: string,
  patch: Partial<Release>,
): Promise<Release> {
  const { data, error } = await supabase
    .from("releases")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", releaseId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update release: ${error.message}`);
  }

  return data as Release;
}

/**
 * Validates metadata, submits through the provider rail, and persists delivery state.
 */
export async function submitReleaseToProvider(
  supabase: SupabaseClient,
  releaseId: string,
  providerId: string,
): Promise<SubmitReleaseToProviderResult> {
  const provider = getProvider(providerId);
  if (!provider) {
    return { ok: false, error: `Unknown provider: ${providerId}`, code: "not_found" };
  }

  if (!provider.configured) {
    return {
      ok: false,
      error: `Provider "${providerId}" is not configured.`,
      code: "not_configured",
    };
  }

  const release = await fetchRelease(supabase, releaseId);
  if (!release) {
    return { ok: false, error: "Release not found.", code: "not_found" };
  }

  const tracks = await fetchTracks(supabase, releaseId);

  const metadata = validateReleaseMetadata(release, tracks);
  if (!metadata.ok) {
    await writeAuditLog(supabase, {
      action: "release.submit.validation_failed",
      resource_type: "release",
      resource_id: releaseId,
      metadata: { provider_id: providerId, issues: metadata.issues },
    });

    return {
      ok: false,
      error: "Release metadata validation failed.",
      issues: metadata.issues,
      code: "validation_failed",
    };
  }

  const providerValidation = await provider.validateRelease(release, tracks);
  if (!providerValidation.ok) {
    await writeAuditLog(supabase, {
      action: "release.submit.provider_validation_failed",
      resource_type: "release",
      resource_id: releaseId,
      metadata: {
        provider_id: providerId,
        issues: providerValidation.issues,
      },
    });

    return {
      ok: false,
      error: "Provider rejected release metadata.",
      issues: providerValidation.issues,
      code: "validation_failed",
    };
  }

  let delivery = await upsertDelivery(supabase, releaseId, providerId, {
    status: "pending",
    last_error: null,
  });

  const submitResult = await provider.submitRelease(release, tracks);

  if (!submitResult.ok) {
    delivery = await upsertDelivery(supabase, releaseId, providerId, {
      status: "failed",
      last_error: submitResult.message,
    });

    await updateReleaseStatus(supabase, releaseId, {
      status: "failed",
      last_error: submitResult.message,
    });

    await writeAuditLog(supabase, {
      action: "release.submit.failed",
      resource_type: "release",
      resource_id: releaseId,
      metadata: {
        provider_id: providerId,
        delivery_id: delivery.id,
        code: submitResult.code,
        message: submitResult.message,
      },
    });

    return {
      ok: false,
      error: submitResult.message,
      code:
        submitResult.code === "not_configured"
          ? "not_configured"
          : "provider_error",
    };
  }

  const submittedAt = new Date().toISOString();
  const nextReleaseStatus =
    submitResult.data.status === "queued" ? "queued" : "submitted";

  delivery = await upsertDelivery(supabase, releaseId, providerId, {
    status: submitResult.data.status,
    provider_ref: submitResult.data.providerRef,
    mode: submitResult.data.mode,
    submitted_at: submittedAt,
    last_error: null,
  });

  const updatedRelease = await updateReleaseStatus(supabase, releaseId, {
    status: nextReleaseStatus,
    submitted_at: submittedAt,
    last_error: null,
  });

  await writeAuditLog(supabase, {
    action: "release.submit.succeeded",
    resource_type: "release",
    resource_id: releaseId,
    metadata: {
      provider_id: providerId,
      delivery_id: delivery.id,
      provider_ref: submitResult.data.providerRef,
      mode: submitResult.data.mode,
      status: submitResult.data.status,
    },
  });

  return { ok: true, delivery, release: updatedRelease };
}
