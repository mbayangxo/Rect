/**
 * Apply Supabase migration SQL files to the linked Postgres database.
 *
 * Set one of:
 *   SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@...
 *   DATABASE_URL=postgresql://...
 *
 * Optional (Management API instead of direct Postgres):
 *   SUPABASE_ACCESS_TOKEN=...
 *   NEXT_PUBLIC_SUPABASE_URL=https://[ref].supabase.co
 *
 * Usage:
 *   node --env-file=.env.local scripts/apply-supabase-sql.mjs 20260830_artist_play_earnings_bootstrap.sql
 *   node --env-file=.env.local scripts/apply-supabase-sql.mjs --fix-probe
 *   node --env-file=.env.local scripts/apply-supabase-sql.mjs --all-artist-os
 *   node --env-file=.env.local scripts/apply-supabase-sql.mjs --all
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import pg from "pg";
import { FIX_PROBE, ARTIST_OS, ALL_RECT, CORE } from "./migration-bundles.mjs";

const { Client } = pg;

function projectRefFromUrl(url) {
  const m = /^https?:\/\/([a-z0-9-]+)\.supabase\.co/i.exec(url ?? "");
  return m?.[1] ?? null;
}

function migrationsDir() {
  return join(process.cwd(), "supabase", "migrations");
}

function readMigration(name) {
  const path = join(migrationsDir(), name);
  return readFileSync(path, "utf8");
}

function isBenignError(message) {
  const m = message ?? "";
  return (
    /already exists/i.test(m) ||
    /duplicate key/i.test(m) ||
    /policy .* already exists/i.test(m) ||
    /relation .* already exists/i.test(m) ||
    /function .* already exists/i.test(m) ||
    /trigger .* already exists/i.test(m) ||
    /column .* of relation .* already exists/i.test(m)
  );
}

export function isMissingSchema(message) {
  return /does not exist|Could not find the table|Could not find the function|PGRST202|PGRST205|schema cache/i.test(
    message ?? "",
  );
}

async function applyViaPostgres(connectionString, sql, label) {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log(`OK  ${label}`);
  } finally {
    await client.end();
  }
}

async function applyViaManagementApi(token, projectRef, sql, label) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof body.message === "string"
        ? body.message
        : typeof body.error === "string"
          ? body.error
          : JSON.stringify(body);
    throw new Error(`${label}: Management API ${res.status} — ${msg}`);
  }
  console.log(`OK  ${label} (management API)`);
}

function resolveBundle(args) {
  if (args.includes("--core")) return CORE;
  if (args.includes("--fix-probe")) return FIX_PROBE;
  if (args.includes("--all-artist-os")) return ARTIST_OS;
  if (args.includes("--all")) return ALL_RECT;
  const files = args.filter((a) => !a.startsWith("--"));
  if (files.length) return files;
  return ["20260830_artist_play_earnings_bootstrap.sql"];
}

async function applyFile(name, { continueOnBenign }) {
  const sql = readMigration(name);
  const dbUrl =
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    "";

  const run = async () => {
    if (dbUrl) {
      await applyViaPostgres(dbUrl, sql, name);
      return;
    }
    const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
    const ref =
      process.env.SUPABASE_PROJECT_REF?.trim() ||
      projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (token && ref) {
      await applyViaManagementApi(token, ref, sql, name);
      return;
    }
    console.error(`
Cannot apply ${name} — no database credentials.

Add to .env.local (easiest):

  SUPABASE_DB_URL=postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres

Get password: Supabase Dashboard → Project Settings → Database → Connection string (URI).

Then run:
  npm run db:apply:fix-probe

Or paste ONE file in SQL Editor (no CLI needed):
  node scripts/bundle-migrations.mjs fix-probe
  → supabase/migrations/_BUNDLE_fix_probe.sql
`);
    process.exit(1);
  };

  try {
    await run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (continueOnBenign && isBenignError(msg)) {
      console.log(`SKIP ${name} (already applied)`);
      return;
    }
    throw e;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const files = resolveBundle(args);
  const continueOnBenign =
    args.includes("--core") ||
    args.includes("--fix-probe") ||
    args.includes("--all-artist-os") ||
    args.includes("--all");

  for (const name of files) {
    const path = join(migrationsDir(), name);
    try {
      readFileSync(path);
    } catch {
      console.error(`FAIL: migration not found: ${name}`);
      console.error(
        "Available:",
        readdirSync(migrationsDir())
          .filter((f) => f.endsWith(".sql"))
          .slice(0, 20)
          .join(", "),
        "…",
      );
      process.exit(1);
    }
  }

  console.log(`Applying ${files.length} migration(s)…\n`);
  let ok = 0;
  let skipped = 0;
  for (const name of files) {
    try {
      await applyFile(name, { continueOnBenign });
      ok += 1;
    } catch (e) {
      console.error(`\nFAIL on ${name}:`, e.message || e);
      console.error(
        "\nFix the error above, then re-run the same command (already-applied files will SKIP).",
      );
      process.exit(1);
    }
  }
  console.log(`\nDone. Applied batch (${ok} files, benign skips logged as SKIP).`);
  console.log("Verify: re-run _probe_missing_aug08_09.sql in SQL Editor.");
}

main().catch((e) => {
  console.error("\nFAIL:", e.message || e);
  process.exit(1);
});
