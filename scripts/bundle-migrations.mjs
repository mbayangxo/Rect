/**
 * Concatenate migration bundles into one SQL file for a single Supabase paste.
 *
 * Usage:
 *   node scripts/bundle-migrations.mjs fix-probe
 *   node scripts/bundle-migrations.mjs artist-os
 *   node scripts/bundle-migrations.mjs all
 */
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { FIX_PROBE, ARTIST_OS, ALL_RECT } from "./migration-bundles.mjs";

const bundles = {
  "fix-probe": {
    out: "_BUNDLE_fix_probe.sql",
    files: FIX_PROBE,
    title: "RECT — fix Aug 8/9 social + studio probe gaps (one paste)",
  },
  "artist-os": {
    out: "_BUNDLE_artist_os.sql",
    files: ARTIST_OS,
    title: "RECT — Artist OS monetization + delivery (one paste)",
  },
  all: {
    out: "_BUNDLE_all_rect.sql",
    files: ALL_RECT,
    title: "RECT — full schema (one paste — large, use CLI if possible)",
  },
};

const key = process.argv[2] || "fix-probe";
const bundle = bundles[key];
if (!bundle) {
  console.error(`Unknown bundle "${key}". Use: fix-probe | artist-os | all`);
  process.exit(1);
}

const dir = join(process.cwd(), "supabase", "migrations");
const parts = [
  `-- ${bundle.title}`,
  `-- Generated: ${new Date().toISOString()}`,
  `-- Files: ${bundle.files.length}`,
  `-- Supabase SQL Editor → paste this entire file → Run`,
  "",
];

for (const name of bundle.files) {
  const path = join(dir, name);
  if (!existsSync(path)) {
    console.error(`Missing: ${name}`);
    process.exit(1);
  }
  parts.push(`-- ═══════════════════════════════════════════════════════════`);
  parts.push(`-- BEGIN ${name}`);
  parts.push(`-- ═══════════════════════════════════════════════════════════`);
  parts.push(readFileSync(path, "utf8").trim());
  parts.push("");
  parts.push(`-- END ${name}`);
  parts.push("");
}

const outPath = join(dir, bundle.out);
writeFileSync(outPath, parts.join("\n") + "\n", "utf8");
const kb = Math.round(readFileSync(outPath).length / 1024);
console.log(`Wrote ${outPath} (${bundle.files.length} files, ~${kb} KB)`);
console.log(`\nPaste in Supabase SQL Editor → Run (one time).`);
