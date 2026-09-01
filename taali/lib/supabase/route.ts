import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";

/**
 * API route client: prefer Authorization Bearer (scripts / clients),
 * otherwise cookie session (browser).
 */
export async function createRouteClient(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  const token = match?.[1]?.trim();

  if (token) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY");
    }
    return createSupabaseJsClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return createCookieClient();
}
