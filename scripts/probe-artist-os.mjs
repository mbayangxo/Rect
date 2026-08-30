/**
 * Probe Artist OS Supabase prerequisites.
 *
 * Usage:
 *   node --env-file=.env.local scripts/probe-artist-os.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error("FAIL: set NEXT_PUBLIC_SUPABASE_URL and ANON_KEY");
  process.exit(1);
}

const client = createClient(url, anon, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const checks = [
  {
    name: "tracks",
    run: () => client.from("tracks").select("id").limit(1),
  },
  {
    name: "plays",
    run: () => client.from("plays").select("id").limit(1),
  },
  {
    name: "user_play_balances",
    run: () => client.from("user_play_balances").select("user_id").limit(1),
  },
  {
    name: "artist_play_earnings",
    run: () => client.from("artist_play_earnings").select("id").limit(1),
    fix: "20260830_artist_play_earnings_bootstrap.sql",
  },
  {
    name: "record_credited_play RPC",
    run: async () => {
      const { error } = await client.rpc("record_credited_play", {
        p_track_id: "00000000-0000-0000-0000-000000000000",
        p_starter: 25,
      });
      if (!error) return { error: null };
      if (/not_authenticated|track_not_found|insufficient/i.test(error.message)) {
        return { error: null };
      }
      if (/does not exist|PGRST202|PGRST205/i.test(error.message)) {
        return { error };
      }
      return { error: null };
    },
    fix: "20260830_artist_play_earnings_bootstrap.sql",
  },
  {
    name: "record_play_earning RPC",
    run: async () => {
      const { error } = await client.rpc("record_play_earning", {
        p_track_id: "00000000-0000-0000-0000-000000000000",
        p_play_id: "00000000-0000-0000-0000-000000000001",
        p_amount_xof: 10,
      });
      if (!error) return { error: null };
      if (/not_authenticated|track_not_found/i.test(error.message)) {
        return { error: null };
      }
      if (/does not exist|PGRST202|PGRST205/i.test(error.message)) {
        return { error };
      }
      return { error: null };
    },
    fix: "20260830_artist_play_earnings_bootstrap.sql",
  },
  {
    name: "track_writer_splits",
    run: () => client.from("track_writer_splits").select("track_id").limit(1),
    fix: "20260810_track_writer_splits.sql",
  },
];

async function main() {
  console.log("Artist OS Supabase probe\n");
  let failed = 0;

  for (const check of checks) {
    const result = await check.run();
    const err = result.error;
    const missing =
      err &&
      /does not exist|Could not find the table|PGRST205|schema cache|PGRST202/i.test(
        err.message,
      );

    if (missing || (err && check.fix)) {
      failed += 1;
      console.log(`MISSING  ${check.name}`);
      if (check.fix) console.log(`         → run supabase/migrations/${check.fix}`);
      else console.log(`         → ${err?.message}`);
    } else if (err) {
      console.log(`OK       ${check.name} (${err.message.slice(0, 60)})`);
    } else {
      console.log(`OK       ${check.name}`);
    }
  }

  console.log(failed ? `\n${failed} gap(s) — apply migrations above.` : "\nAll Artist OS checks passed.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
