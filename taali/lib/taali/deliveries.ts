import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeliveryRow, DeliveryStatus } from "./types";

export async function listDeliveries(
  admin: SupabaseClient,
  organizationId?: string | null,
) {
  let query = admin
    .from("deliveries")
    .select("*")
    .order("created_at", { ascending: false });

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;
  return { data: (data ?? []) as DeliveryRow[], error };
}

export async function providerConfigured(
  admin: SupabaseClient,
  providerId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("delivery_providers")
    .select("id, configured")
    .eq("id", providerId)
    .maybeSingle();

  if (error || !data) return false;
  return Boolean(data.configured);
}

export async function createDelivery(
  admin: SupabaseClient,
  input: {
    releaseId: string;
    organizationId: string;
    providerId: string;
    destinations: string[];
  },
): Promise<{ delivery: DeliveryRow | null; error: Error | null }> {
  const configured = await providerConfigured(admin, input.providerId);
  const status: DeliveryStatus = configured ? "queued" : "not_configured";

  const { data, error } = await admin
    .from("deliveries")
    .insert({
      release_id: input.releaseId,
      organization_id: input.organizationId,
      provider_id: input.providerId,
      destinations: input.destinations,
      status,
      error: configured
        ? null
        : "Delivery provider is not configured in Taali Phase 1.",
    })
    .select("*")
    .single();

  if (error) {
    return { delivery: null, error: new Error(error.message) };
  }

  return { delivery: data as DeliveryRow, error: null };
}
