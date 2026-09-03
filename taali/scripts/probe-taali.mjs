/**
 * Probe Taali Supabase prerequisites.
 *
 * Usage:
 *   node --env-file=.env.local scripts/probe-taali.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error("FAIL: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const client = createClient(url, anon, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function isMissingSchema(message) {
  return /does not exist|Could not find the table|Could not find the function|PGRST202|PGRST205|schema cache/i.test(
    message ?? "",
  );
}

const checks = [
  {
    name: "organizations",
    run: () => client.from("organizations").select("id").limit(1),
    fix: "20260901_001_foundation.sql",
  },
  {
    name: "releases",
    run: () => client.from("releases").select("id").limit(1),
    fix: "20260901_002_catalog.sql",
  },
  {
    name: "release_tracks",
    run: () => client.from("release_tracks").select("id").limit(1),
    fix: "20260901_002_catalog.sql",
  },
  {
    name: "delivery_providers",
    run: () => client.from("delivery_providers").select("id").limit(1),
    fix: "20260901_004_delivery.sql",
  },
  {
    name: "deliveries",
    run: () => client.from("deliveries").select("id").limit(1),
    fix: "20260901_004_delivery.sql",
  },
  {
    name: "api_request_log",
    run: () => client.from("api_request_log").select("id").limit(1),
    fix: "20260901_005_api_audit.sql",
  },
  {
    name: "TAALI_API_KEY env",
    run: async () => {
      if (process.env.TAALI_API_KEY?.trim()) return { error: null };
      return { error: { message: "TAALI_API_KEY not set" } };
    },
    fix: "Set TAALI_API_KEY in .env.local (same value RECT uses)",
    env: true,
  },
];

async function main() {
  console.log("Taali Supabase probe\n");
  let failed = 0;

  for (const check of checks) {
    const result = await check.run();
    const err = result.error;
    const missing = err && (check.env || isMissingSchema(err.message));

    if (missing) {
      failed += 1;
      console.log(`MISSING  ${check.name}`);
      if (check.fix) {
        if (check.env) {
          console.log(`         → ${check.fix}`);
        } else {
          console.log(`         → npm run db:apply -- ${check.fix}`);
          console.log(
            `         → or paste supabase/migrations/${check.fix} in SQL Editor`,
          );
        }
      }
    } else if (err) {
      console.log(`OK       ${check.name} (${err.message.slice(0, 60)})`);
    } else {
      console.log(`OK       ${check.name}`);
    }
  }

  console.log(
    failed
      ? `\n${failed} gap(s) — run: npm run db:apply:all`
      : "\nAll Taali checks passed.",
  );
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
