#!/usr/bin/env node
/**
 * Git pre-commit gate (wired via core.hooksPath = .githooks).
 * Blocks commit unless typecheck + i18n catalog check pass.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(label, cmd, args) {
  console.log(`\n▸ ${label}`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(`\n✗ pre-commit failed: ${label}`);
    process.exit(r.status ?? 1);
  }
}

console.log("pre-commit · baribari");
run("typecheck", "npm", ["run", "typecheck"]);
// Catalog key parity is required; hardcoded scan is advisory (not --strict)
run("check:i18n", "npm", ["run", "check:i18n"]);
console.log("\n✓ pre-commit ok\n");
