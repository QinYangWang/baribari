/**
 * Lightweight UI i18n (zh / ja / en).
 * Separate from ASR --lang.
 */

import type { MessageTree, UiLang } from "./types.js";
import { UI_LANGS } from "./types.js";
import zh from "./locales/zh.js";
import ja from "./locales/ja.js";
import en from "./locales/en.js";

export type { UiLang, MessageTree } from "./types.js";
export { UI_LANGS } from "./types.js";

const catalogs: Record<UiLang, MessageTree> = { zh, ja, en };

/** Default UI language when nothing is configured. */
export const DEFAULT_UI_LANG: UiLang = "en";

let current: UiLang = DEFAULT_UI_LANG;

export function isUiLang(v: unknown): v is UiLang {
  return typeof v === "string" && (UI_LANGS as string[]).includes(v);
}

/**
 * Detect UI language from env / OS locale.
 * Fallback is English (not Chinese).
 */
export function detectUiLang(): UiLang {
  const env =
    process.env.BARIBARI_UI_LANG ||
    process.env.LANG ||
    process.env.LC_ALL ||
    process.env.LC_MESSAGES ||
    "";
  const s = env.toLowerCase();
  if (s.startsWith("ja") || s.includes("japanese")) return "ja";
  if (s.startsWith("zh") || s.includes("chinese")) return "zh";
  if (s.startsWith("en") || s.includes("english")) return "en";
  return DEFAULT_UI_LANG;
}

/** Resolve without prompting: flag > config > env/OS > default en. */
export function resolveUiLang(opts?: {
  flag?: string;
  saved?: string;
}): UiLang {
  if (isUiLang(opts?.flag)) return opts!.flag!;
  if (isUiLang(opts?.saved)) return opts!.saved!;
  return detectUiLang();
}

export function setUiLang(lang: UiLang): void {
  current = lang;
}

export function getUiLang(): UiLang {
  return current;
}

export function uiLangLabel(lang: UiLang): string {
  if (lang === "zh") return "中文";
  if (lang === "ja") return "日本語";
  return "English";
}

export function localeTag(lang: UiLang = current): string {
  if (lang === "ja") return "ja-JP";
  if (lang === "en") return "en-US";
  return "zh-CN";
}

type Vars = Record<string, string | number | undefined | null>;

function lookup(tree: MessageTree, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = tree;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k];
    return v == null ? "" : String(v);
  });
}

/** Translate by dotted key, e.g. t("status.listening"). */
export function t(key: string, vars?: Vars): string {
  const primary = lookup(catalogs[current], key);
  if (primary != null) return format(primary, vars);
  const fallback = lookup(catalogs.en, key) ?? lookup(catalogs.zh, key);
  if (fallback != null) return format(fallback, vars);
  return key;
}

export function messages(): MessageTree {
  return catalogs[current];
}
