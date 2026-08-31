import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Anon client for simple public reads (health checks, etc.).
 * Prefer lib/supabase/server or client for auth.
 * Lazy so `next build` can collect route data without env at import time.
 */
export function getPublicSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error("supabaseUrl is required.");
  }
  cached = createClient(url, key);
  return cached;
}

/** @deprecated Prefer getPublicSupabase() so builds do not crash on import. */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getPublicSupabase();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
