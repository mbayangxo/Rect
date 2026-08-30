/**
 * Apply Artist OS + analytics Supabase migrations, then verify.
 *
 * Usage:
 *   node --env-file=.env.local scripts/apply-artist-os.mjs
 */
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(label, script, extraArgs = []) {
  console.log(`\n→ ${label}`);
  const res = spawnSync(
    process.execPath,
    ["--env-file=.env.local", join(root, "scripts", script), ...extraArgs],
    { cwd: root, stdio: "inherit", env: process.env },
  );
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

run("Apply earnings + completion migrations", "apply-supabase-sql.mjs", [
  "--all-artist-os",
]);
run("Probe Artist OS tables", "probe-artist-os.mjs");
