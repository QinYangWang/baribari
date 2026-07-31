#!/usr/bin/env node
/**
 * i18n consistency + hardcoded UI string scanner.
 *
 * Checks:
 *  1. Locale key trees (en as canonical)
 *  2. zh / ja / en have the same key set
 *  3. No empty string values in catalogs
 *  4. Scan src/*.ts for likely hardcoded UI strings not using t()
 *
 * Usage:
 *   node scripts/check-i18n.mjs
 *   node scripts/check-i18n.mjs --strict   # treat scan warnings as errors
 *
 * Exit: 0 ok · 1 catalog errors · 2 scan findings (only with --strict)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const strict = process.argv.includes("--strict");

const localeDir = path.join(root, "src", "i18n", "locales");
const srcDir = path.join(root, "src");

/** Flatten nested object to dotted keys → string values only. */
function flatten(obj, prefix = "", out = {}) {
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else if (v && typeof v === "object") flatten(v, key, out);
  }
  return out;
}

async function loadLocale(name) {
  const file = path.join(localeDir, `${name}.ts`);
  let src = fs.readFileSync(file, "utf8");
  src = src
    .replace(/import\s+type[\s\S]*?;\s*/g, "")
    .replace(/import\s+[\s\S]*?from\s+["'][^"']+["']\s*;\s*/g, "")
    .replace(/const\s+(\w+)\s*:\s*MessageTree\s*=/, "const $1 =")
    .replace(/export\s+default\s+(\w+)\s*;?\s*$/m, "export default $1;\n");
  if (!/export\s+default/.test(src)) {
    const m = src.match(/const\s+(\w+)\s*=/);
    if (m) src += `\nexport default ${m[1]};\n`;
  }
  const cacheDir = path.join(root, "node_modules", ".cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  const tmp = path.join(cacheDir, `i18n-check-${name}.mjs`);
  fs.writeFileSync(tmp, src);
  const mod = await import(pathToFileURL(tmp).href + `?t=${Date.now()}`);
  return mod.default ?? mod;
}

function walkTs(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "i18n" || ent.name === "node_modules") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTs(p, files);
    else if (ent.name.endsWith(".ts") && !ent.name.endsWith(".d.ts")) {
      files.push(p);
    }
  }
  return files;
}

/** Extract string literals without catastrophic backtracking. */
function extractStrings(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      i += 2;
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      const start = i;
      i++;
      let body = "";
      let hasInterp = false;
      while (i < n) {
        const ch = src[i];
        if (ch === "\\") {
          body += src[i + 1] ?? "";
          i += 2;
          continue;
        }
        if (quote === "`" && ch === "$" && src[i + 1] === "{") {
          hasInterp = true;
          i += 2;
          let depth = 1;
          while (i < n && depth > 0) {
            if (src[i] === "{") depth++;
            else if (src[i] === "}") depth--;
            i++;
          }
          body += " ";
          continue;
        }
        if (ch === quote) {
          i++;
          break;
        }
        body += ch;
        i++;
      }
      out.push({ start, quote, body, hasInterp });
      continue;
    }
    i++;
  }
  return out;
}

function scanHardcoded(file, text) {
  const findings = [];
  const rel = path.relative(root, file).replace(/\\/g, "/");
  const strings = extractStrings(text);

  for (const s of strings) {
    if (s.hasInterp) continue;
    const body = s.body;
    if (body.trim().length < 4) continue;
    if (
      /^(https?:|file:|\/|\\|[A-Za-z]:\\|~\/|\.\/|\.\.\/)/.test(body) ||
      body.includes("node_modules") ||
      body.includes("package.json")
    ) {
      continue;
    }
    if (/^[a-z0-9_.:\-/@]+$/i.test(body) && !/[ ]/.test(body)) continue;
    if (/^[A-Z][A-Z0-9_]+$/.test(body)) continue;
    if (body.includes("\x1b") || /\\x1b|\\u001b/.test(body)) continue;
    if (body.startsWith("text/") || body.startsWith("application/")) continue;
    if (body.length > 200) continue;

    const hasCjk = /[\u3040-\u30ff\u3400-\u9fff]/.test(body);
    const words = body.trim().split(/\s+/);
    const looksEnglishUi =
      !hasCjk &&
      words.length >= 2 &&
      /[A-Za-z]/.test(body) &&
      (/^[A-Z]/.test(body.trim()) ||
        /[.!?…:]$/.test(body.trim()) ||
        /\b(press|click|enable|disable|missing|invalid|failed|error|cannot|please|session|share|record|language|settings)\b/i.test(
          body,
        ));

    if (!hasCjk && !looksEnglishUi) continue;

    const lineStart = text.lastIndexOf("\n", s.start) + 1;
    const lineEnd = text.indexOf("\n", s.start);
    const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    if (/\bt\s*\(/.test(line)) continue;
    if (/^AI HTTP \d+/.test(body)) continue;
    if (rel.includes("session.ts") && hasCjk && body.length > 8) {
      if (!/设置|错误|失败|请|退出|共享|翻译|总结/.test(body)) continue;
    }
    if (rel.includes("share-server.ts") && body.length > 40) continue;

    const lineNo = text.slice(0, s.start).split("\n").length;
    findings.push({ file: rel, line: lineNo, text: body.slice(0, 80) });
  }
  return findings;
}

function compareKeys(name, keys, canonical) {
  const errs = [];
  const set = new Set(keys);
  const can = new Set(canonical);
  for (const k of can) {
    if (!set.has(k)) errs.push(`[${name}] missing key: ${k}`);
  }
  for (const k of set) {
    if (!can.has(k)) errs.push(`[${name}] extra key: ${k}`);
  }
  return errs;
}

async function main() {
  console.log("i18n check · baribari\n");

  const langs = ["en", "zh", "ja"];
  const flats = {};
  const loadErrs = [];

  for (const lang of langs) {
    try {
      const tree = await loadLocale(lang);
      if (!tree || typeof tree !== "object") {
        loadErrs.push(`[${lang}] locale did not export an object`);
        continue;
      }
      flats[lang] = flatten(tree);
    } catch (e) {
      loadErrs.push(
        `[${lang}] failed to load: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  if (loadErrs.length) {
    console.error("Load errors:");
    for (const e of loadErrs) console.error("  " + e);
    process.exit(1);
  }

  const canonical = Object.keys(flats.en).sort();
  let catalogErrors = [];

  for (const lang of langs) {
    if (lang === "en") continue;
    catalogErrors = catalogErrors.concat(
      compareKeys(lang, Object.keys(flats[lang]), canonical),
    );
  }

  for (const lang of langs) {
    for (const [k, v] of Object.entries(flats[lang])) {
      if (typeof v === "string" && v.length === 0) {
        catalogErrors.push(`[${lang}] empty value: ${k}`);
      }
    }
  }

  console.log(`Catalog keys (en): ${canonical.length}`);
  if (catalogErrors.length) {
    console.error(`\nCatalog errors (${catalogErrors.length}):`);
    for (const e of catalogErrors.slice(0, 80)) console.error("  " + e);
    if (catalogErrors.length > 80) {
      console.error(`  … +${catalogErrors.length - 80} more`);
    }
  } else {
    console.log("Catalog: zh / ja match en key set ✓");
  }

  const files = walkTs(srcDir);
  let findings = [];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    findings = findings.concat(scanHardcoded(f, text));
  }

  const seen = new Set();
  findings = findings.filter((x) => {
    const k = `${x.file}:${x.line}:${x.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  console.log(`\nHardcoded UI scan: ${findings.length} candidate(s)`);
  if (findings.length) {
    const byFile = new Map();
    for (const f of findings) {
      if (!byFile.has(f.file)) byFile.set(f.file, []);
      byFile.get(f.file).push(f);
    }
    for (const [file, list] of [...byFile.entries()].sort()) {
      console.log(`  ${file} (${list.length})`);
      for (const item of list.slice(0, 12)) {
        const preview = item.text.replace(/\n/g, "\\n");
        console.log(`    L${item.line}: ${preview}`);
      }
      if (list.length > 12) console.log(`    … +${list.length - 12} more`);
    }
    console.log(
      "\nNote: scanner is heuristic. Prefer t(\"…\") for user-facing chrome.",
    );
  } else {
    console.log("Hardcoded UI scan: clean ✓");
  }

  if (catalogErrors.length) process.exit(1);
  if (strict && findings.length) process.exit(2);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
