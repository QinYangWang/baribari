/**
 * Local (non-AI) transcript polish:
 * - light cleanup (whitespace, repeated punctuation)
 * - user dictionary: ~/.config/baribari/replace.json
 *
 * Runs after ASR / speaker-turn join, before AI correct/translate.
 */

import fs from "node:fs";
import path from "node:path";
import { configDir } from "./paths.js";
import type { Segment } from "./types.js";
import { isPartialSegment } from "./types.js";

export interface ReplaceRule {
  from: string;
  to: string;
}

export interface PostprocessConfig {
  enabled: boolean;
  replacements: ReplaceRule[];
}

const DEFAULT_CFG: PostprocessConfig = {
  enabled: true,
  replacements: [],
};

let cache: {
  mtimeMs: number;
  cfg: PostprocessConfig;
  path: string;
} | null = null;

export function replaceJsonPath(): string {
  return path.join(configDir(), "replace.json");
}

/** Parse replace.json — array, {replacements}, or flat string map. */
export function parseReplaceFile(raw: string): PostprocessConfig {
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== "object") return { ...DEFAULT_CFG };

  // Flat map: { "错词": "正词", ... }
  if (!Array.isArray(data) && !("replacements" in (data as object)) && !("enabled" in (data as object))) {
    const replacements: ReplaceRule[] = [];
    for (const [from, to] of Object.entries(data as Record<string, unknown>)) {
      if (typeof to === "string" && from) replacements.push({ from, to });
    }
    return { enabled: true, replacements };
  }

  if (Array.isArray(data)) {
    const replacements: ReplaceRule[] = [];
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const o = item as { from?: unknown; to?: unknown };
      if (typeof o.from === "string" && typeof o.to === "string" && o.from) {
        replacements.push({ from: o.from, to: o.to });
      }
    }
    return { enabled: true, replacements };
  }

  const o = data as {
    enabled?: unknown;
    replacements?: unknown;
  };
  const enabled = o.enabled === undefined ? true : Boolean(o.enabled);
  const replacements: ReplaceRule[] = [];
  if (Array.isArray(o.replacements)) {
    for (const item of o.replacements) {
      if (!item || typeof item !== "object") continue;
      const r = item as { from?: unknown; to?: unknown };
      if (typeof r.from === "string" && typeof r.to === "string" && r.from) {
        replacements.push({ from: r.from, to: r.to });
      }
    }
  }
  return { enabled, replacements };
}

export function loadPostprocessConfig(force = false): PostprocessConfig {
  const file = replaceJsonPath();
  try {
    if (!fs.existsSync(file)) {
      cache = { mtimeMs: 0, cfg: { ...DEFAULT_CFG }, path: file };
      return cache.cfg;
    }
    const st = fs.statSync(file);
    if (
      !force &&
      cache &&
      cache.path === file &&
      cache.mtimeMs === st.mtimeMs
    ) {
      return cache.cfg;
    }
    const raw = fs.readFileSync(file, "utf8");
    const cfg = parseReplaceFile(raw);
    // longest first so "ビジネス日言語" wins over "日言語"
    cfg.replacements.sort((a, b) => b.from.length - a.from.length);
    cache = { mtimeMs: st.mtimeMs, cfg, path: file };
    return cfg;
  } catch {
    return { ...DEFAULT_CFG, replacements: [] };
  }
}

/**
 * Built-in high-precision replacements (SenseVoice common confusions).
 * Applied after cleanup, before user replace.json (user rules still win if longer).
 */
const BUILTIN_REPLACEMENTS: ReplaceRule[] = [
  // Japanese / loanwords (meeting demos)
  { from: "日言語", to: "日本語" },
  { from: "ビジネス日言語", to: "ビジネス日本語" },
  { from: "ズーム", to: "Zoom" },
  { from: "ズ-ム", to: "Zoom" },
  { from: "ピーナインティファイブ", to: "P95" },
  { from: "オーオース", to: "OAuth" },
  { from: "シーエスアールエフ", to: "CSRF" },
  { from: "ウェブパック", to: "webpack" },
  { from: "コンフルエンス", to: "Confluence" },
  { from: "お願いたします", to: "お願いいたします" },
  { from: "よしくお願", to: "よろしくお願" },
  { from: "茜かね", to: "あかね" },
  // Chinese common ASR slips (light, high precision)
  { from: "的的", to: "的" },
  { from: "了了", to: "了" },
  { from: "嗯嗯", to: "嗯" },
  { from: "啊啊", to: "啊" },
];

/** Builtin cleanup — no dictionary. */
export function cleanupText(text: string): string {
  let s = (text || "").normalize("NFKC");
  // SenseVoice / FunASR style tags
  s = s.replace(/<\|[^|]*\|>/g, "");
  // zero-width / bom
  s = s.replace(/[\u200b-\u200d\ufeff]/g, "");
  // whitespace (keep single space; strip around CJK handled lightly)
  s = s.replace(/[ \t\f\v]+/g, " ");
  s = s.replace(/\s*\n\s*/g, "\n").trim();
  // collapse repeated punctuation
  s = s.replace(/([、，,]){2,}/g, "$1");
  s = s.replace(/([。．.]){2,}/g, "$1");
  s = s.replace(/([！!]){2,}/g, "$1");
  s = s.replace(/([？?]){2,}/g, "$1");
  s = s.replace(/(…){2,}/g, "…");
  // "。、" / "、。" odd pairs
  s = s.replace(/、+。/g, "。");
  s = s.replace(/。、+/g, "。");
  // triple+ same CJK char (stutter) → double max (conservative)
  s = s.replace(/([\u3040-\u30ff\u3400-\u9fff])\1{2,}/g, "$1$1");
  // space between CJK characters
  s = s.replace(
    /([\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff])\s+([\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff])/g,
    "$1$2",
  );
  // trailing spaces before punct
  s = s.replace(/\s+([、。．，,!！?？…])/g, "$1");
  // leading filler particles sometimes glued after pad (very light)
  s = s.replace(/^(えっと|あのー|あの|えーと|嗯+|呃+|那个)[、,\s]*/u, "");
  return s.trim();
}

export function applyDictionary(text: string, rules: ReplaceRule[]): string {
  if (!rules.length) return text;
  let s = text;
  for (const r of rules) {
    if (!r.from) continue;
    if (s.includes(r.from)) {
      s = s.split(r.from).join(r.to);
    }
  }
  return s;
}

/**
 * Full local polish. Safe to call often (replace.json cached by mtime).
 */
export function postprocessText(text: string): string {
  const raw = (text || "").trim();
  if (!raw) return "";
  const cfg = loadPostprocessConfig();
  let s = cleanupText(raw);
  // Built-ins + user dict, longest match first (user rules can override same `from`)
  const byFrom = new Map<string, string>();
  for (const r of BUILTIN_REPLACEMENTS) byFrom.set(r.from, r.to);
  if (cfg.enabled) {
    for (const r of cfg.replacements) byFrom.set(r.from, r.to);
  }
  const merged = [...byFrom.entries()]
    .map(([from, to]) => ({ from, to }))
    .sort((a, b) => b.from.length - a.from.length);
  s = applyDictionary(s, merged);
  s = cleanupText(s);
  return s;
}

/** Mutate segment text in place (finals only; skips partials). */
export function postprocessSegment(seg: Segment): Segment {
  if (isPartialSegment(seg)) return seg;
  const next = postprocessText(seg.text || "");
  if (next && next !== (seg.text || "").trim()) {
    seg.text = next;
  } else if (next) {
    seg.text = next;
  }
  return seg;
}

/** Seed a commented example file if missing (does not overwrite). */
export function ensureReplaceExample(): void {
  const file = replaceJsonPath();
  if (fs.existsSync(file)) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const example = {
      enabled: true,
      replacements: [
        { from: "日言語", to: "日本語" },
        { from: "ズーム", to: "Zoom" },
        { from: "ピーナインティファイブ", to: "P95" },
      ],
    };
    fs.writeFileSync(file, JSON.stringify(example, null, 2) + "\n", "utf8");
  } catch {
    /* ignore */
  }
}
