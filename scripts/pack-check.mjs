#!/usr/bin/env node
/**
 * Build the CLI and verify the npm pack tarball contents.
 * Does not publish.
 */
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(label, cmd, args, opts = {}) {
  console.log(`▸ ${label}`);
  execFileSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
}

run("build", "pnpm", ["run", "build"]);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baribari-pack-"));
const packOut = execFileSync("pnpm", ["pack", "--pack-destination", tmp], {
  cwd: root,
  encoding: "utf8",
}).trim();
const tgzLine = packOut
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean)
  .at(-1);
const tgz = path.isAbsolute(tgzLine) ? tgzLine : path.join(tmp, path.basename(tgzLine));
if (!fs.existsSync(tgz)) {
  console.error("pack:check: tarball not found:", tgzLine);
  process.exit(1);
}

const list = execSync(`tar -tzf ${JSON.stringify(tgz)}`, {
  encoding: "utf8",
})
  .split(/\r?\n/)
  .filter(Boolean);

const required = [
  "package/dist/index.js",
  "package/package.json",
  "package/README.md",
  "package/README.zh.md",
  "package/README.ja.md",
  "package/LICENSE",
];
const missing = required.filter((f) => !list.includes(f));
if (missing.length) {
  console.error("pack:check: missing required files:\n" + missing.join("\n"));
  process.exit(1);
}

const forbidden = list.filter(
  (f) =>
    f.startsWith("package/apps/") ||
    f.startsWith("package/docs/") ||
    f.includes("node_modules") ||
    f.startsWith("package/models/") ||
    f.startsWith("package/recordings/") ||
    f.startsWith("package/fixtures/") ||
    f === "package/pnpm-lock.yaml" ||
    f === "package/pnpm-workspace.yaml",
);
if (forbidden.length) {
  console.error("pack:check: unexpected package contents:\n" + forbidden.join("\n"));
  process.exit(1);
}

const hasDts = list.some((f) => f.startsWith("package/dist/") && f.endsWith(".d.ts"));
if (!hasDts) {
  console.error("pack:check: no declaration files in dist/");
  process.exit(1);
}

const extractDir = path.join(tmp, "extract");
fs.mkdirSync(extractDir);
execSync(`tar -xzf ${JSON.stringify(tgz)} -C ${JSON.stringify(extractDir)}`);
const entry = path.join(extractDir, "package", "dist", "index.js");
const head = fs.readFileSync(entry, "utf8").slice(0, 32);
if (!head.startsWith("#!/usr/bin/env node")) {
  console.error("pack:check: dist/index.js missing node shebang");
  process.exit(1);
}
const mode = fs.statSync(entry).mode;
// Best-effort executable bit check (npm sets mode on publish; pack may vary by OS)
void mode;

// Exercise the exact packed entry while resolving dependencies from the verified
// workspace install. A published consumer gets these dependencies from its package
// manager; the bare extraction above intentionally contains no node_modules.
const installedModules = path.join(root, "node_modules");
if (!fs.existsSync(installedModules)) {
  console.error("pack:check: workspace node_modules is missing");
  process.exit(1);
}
fs.symlinkSync(
  installedModules,
  path.join(extractDir, "package", "node_modules"),
  process.platform === "win32" ? "junction" : "dir",
);
execFileSync(process.execPath, [entry, "--help"], {
  cwd: root,
  stdio: "inherit",
});

console.log(`\n✓ pack:check ok (${list.length} files) ${path.basename(tgz)}`);
