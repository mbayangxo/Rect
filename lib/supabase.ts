import { createClient } from "@supabase/supabase-js";

/** Anon client for simple public reads (health checks, etc.). Prefer lib/supabase/server or client for auth. */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
