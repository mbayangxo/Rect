import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function isUsableServiceRoleKey(key: string) {
  if (!key || /SENSITI|REDACTED|your[_-]?key|placeholder/i.test(key)) {
    return false;
  }
  return key.split(".").length === 3 || key.startsWith("sb_");
}

/** Server-only admin client. Returns null if service role is not configured. */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !isUsableServiceRoleKey(key)) return null;

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
