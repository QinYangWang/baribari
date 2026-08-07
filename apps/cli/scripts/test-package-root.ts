/**
 * packageRoot / packed layout path tests.
 * Run: pnpm --filter baribari test:package-root
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { packageRoot, projectRoot } from "../src/paths.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const cliPkgDir = path.resolve(here, "..");
const require = createRequire(import.meta.url);

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(err);
  }
}

test("packageRoot resolves to apps/cli (package.json + name baribari)", () => {
  const root = packageRoot();
  assert.equal(path.resolve(root), cliPkgDir);
  const pkgPath = path.join(root, "package.json");
  assert.ok(fs.existsSync(pkgPath), `missing ${pkgPath}`);
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
    name: string;
    bin?: Record<string, string>;
  };
  assert.equal(pkg.name, "baribari");
  assert.equal(pkg.bin?.baribari, "dist/index.js");
});

test("projectRoot aliases packageRoot", () => {
  assert.equal(projectRoot(), packageRoot());
});

test("packageRoot is not the workspace repository root", () => {
  const root = packageRoot();
  assert.ok(
    !fs.existsSync(path.join(root, "pnpm-workspace.yaml")),
    "packageRoot must not be the monorepo root",
  );
  assert.ok(
    fs.existsSync(path.join(root, "src", "index.ts")) ||
      fs.existsSync(path.join(root, "dist", "index.js")),
    "package root should contain src or dist entry",
  );
});

test("CLI package.json is loadable the same way as index.ts", () => {
  const pkg = require("../package.json") as { name: string; version: string };
  assert.equal(pkg.name, "baribari");
  assert.equal(typeof pkg.version, "string");
  assert.match(pkg.version, /^\d+\.\d+\.\d+/);
});

test("built dist entry has shebang when present", () => {
  const entry = path.join(cliPkgDir, "dist", "index.js");
  if (!fs.existsSync(entry)) {
    console.log("  · skip shebang (dist not built yet)");
    return;
  }
  const head = fs.readFileSync(entry, "utf8").slice(0, 32);
  assert.ok(
    head.startsWith("#!/usr/bin/env node"),
    `expected shebang in ${entry}, got: ${JSON.stringify(head)}`,
  );
});

console.log("\npackage-root tests");
if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
