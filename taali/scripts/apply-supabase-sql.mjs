/**
 * Apply Taali Supabase migration SQL files to the linked Postgres database.
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
 *   node --env-file=.env.local scripts/apply-supabase-sql.mjs 20260901_001_foundation.sql
 *   node --env-file=.env.local scripts/apply-supabase-sql.mjs --all
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import pg from "pg";

const { Client } = pg;

const TAALI_MIGRATIONS = [
  "20260901_001_foundation.sql",
  "20260901_002_catalog.sql",
  "20260901_003_rights.sql",
  "20260901_004_delivery.sql",
  "20260901_005_api_audit.sql",
];

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

async function applyViaPostgres(connectionString, sql, label) {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log(`OK  ${label} (postgres)`);
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

async function applyFile(name) {
  const sql = readMigration(name);
  const dbUrl =
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    "";

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

Add ONE of these to .env.local:

  SUPABASE_DB_URL=postgresql://postgres.[ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres

  — or —

  SUPABASE_ACCESS_TOKEN=[personal access token from supabase.com/dashboard/account/tokens]
  NEXT_PUBLIC_SUPABASE_URL=https://[ref].supabase.co

Then re-run:
  node --env-file=.env.local scripts/apply-supabase-sql.mjs ${name}

Or paste the file in Supabase Dashboard → SQL Editor → Run:
  supabase/migrations/${name}
`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const files = args.includes("--all")
    ? TAALI_MIGRATIONS
    : args.length
      ? args
      : [TAALI_MIGRATIONS[0]];

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
          .join(", ") || "(none)",
      );
      process.exit(1);
    }
  }

  console.log("Applying Taali Supabase migrations…\n");
  for (const name of files) {
    await applyFile(name);
  }
  console.log("\nDone. Verify with: npm run probe:taali");
}

main().catch((e) => {
  console.error("\nFAIL:", e.message || e);
  process.exit(1);
});
