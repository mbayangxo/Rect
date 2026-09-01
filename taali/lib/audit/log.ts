import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditLogEntry = {
  action: string;
  actor?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Persists an audit event. Failures are logged but do not throw.
 */
export async function writeAuditLog(
  supabase: SupabaseClient,
  entry: AuditLogEntry,
): Promise<void> {
  const row = {
    action: entry.action,
    actor: entry.actor ?? null,
    resource_type: entry.resource_type ?? null,
    resource_id: entry.resource_id ?? null,
    metadata: entry.metadata ?? {},
  };

  const { error } = await supabase.from("audit_logs").insert(row);

  if (error) {
    console.error("[audit] failed to write log:", error.message, row);
  }
}
