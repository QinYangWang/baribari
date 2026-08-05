import { BASE, withBase } from "@/lib/site-config";

export const LOCALES = ["en", "zh", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Short labels for the header switcher (mobile-friendly). */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "EN",
  zh: "ZH",
  ja: "JA",
};

/** Full names for accessibility (aria-label / title). */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  zh: "中文",
  ja: "日本語",
};

export const LOCALE_HTML_LANG: Record<Locale, string> = {
  en: "en",
  zh: "zh-CN",
  ja: "ja",
};

/** UI copy used on home / chrome. */
export const UI = {
  en: {
    homeTitle: "baribari — Home",
    tagline: "Local-first meeting transcription in your terminal.",
    browseTags: "Browse tags",
    search: "Search",
    home: "Home",
    notes: "notes",
    note: "note",
    navigation: "Navigation",
    copy: "Copy",
    copied: "Copied",
    installCmd: "npm i -g baribari",
    categoryLabels: {
      start: "Start",
      use: "Use",
      configure: "Configure",
      reference: "Reference",
      project: "Project",
      help: "Help",
    } as Record<string, string>,
  },
  zh: {
    homeTitle: "baribari — 首页",
    tagline: "终端里的本地优先会议实时转写。",
    browseTags: "浏览标签",
    search: "搜索",
    home: "首页",
    notes: "篇",
    note: "篇",
    navigation: "导航",
    copy: "复制",
    copied: "已复制",
    installCmd: "npm i -g baribari",
    categoryLabels: {
      start: "从这里开始",
      use: "使用",
      configure: "配置",
      reference: "参考",
      project: "项目",
      help: "帮助",
    } as Record<string, string>,
  },
  ja: {
    homeTitle: "baribari — ホーム",
    tagline: "ターミナルでローカル優先の会議文字起こし。",
    browseTags: "タグ一覧",
    search: "検索",
    home: "ホーム",
    notes: "件",
    note: "件",
    navigation: "ナビ",
    copy: "コピー",
    copied: "コピー済み",
    installCmd: "npm i -g baribari",
    categoryLabels: {
      start: "はじめる",
      use: "使う",
      configure: "設定",
      reference: "リファレンス",
      project: "プロジェクト",
      help: "ヘルプ",
    } as Record<string, string>,
  },
} as const;

export type UiCopy = (typeof UI)[Locale];

/** Sidebar + home category order (must match). */
export const CATEGORY_ORDER = [
  "start",
  "use",
  "configure",
  "reference",
  "project",
  "help",
  "overview",
] as const;

/** Within-category page order (slug basename). */
export const PAGE_ORDER: Record<string, readonly string[]> = {
  start: ["overview", "install", "quick-start"],
  use: ["live", "sessions", "speakers", "share"],
  configure: ["configuration", "models-ai", "tui-i18n"],
  reference: ["cli", "files"],
  project: ["architecture", "asr-pipeline", "roadmap", "github-pages"],
  help: ["troubleshooting"],
};

export function navOrderIndex(
  order: readonly string[],
  key: string,
): number {
  const i = order.indexOf(key);
  return i === -1 ? 999 : i;
}

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/**
 * Detect locale from a pathname that may include the site base.
 * `/baribari/zh/...` → zh, `/baribari/wiki/ja/...` → ja, else en.
 */
export function getLocaleFromPath(pathname: string): Locale {
  const stripped = stripBase(pathname);
  const parts = stripped.split("/").filter(Boolean);
  if (parts[0] && isLocale(parts[0]) && parts[0] !== "en") return parts[0];
  if (parts[0] === "wiki" && parts[1] && isLocale(parts[1])) return parts[1];
  return DEFAULT_LOCALE;
}

/** Remove site base prefix from pathname. */
export function stripBase(pathname: string): string {
  const base = BASE.replace(/\/$/, "");
  if (base && (pathname === base || pathname.startsWith(`${base}/`))) {
    return pathname.slice(base.length) || "/";
  }
  return pathname || "/";
}

/** Locale prefix for root-absolute site paths (no base). `en` → `""`, `zh` → `"/zh"`. */
export function localePrefix(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? "" : `/${locale}`;
}

/** Home URL for a locale (with base). */
export function homeHref(locale: Locale): string {
  return withBase(locale === DEFAULT_LOCALE ? "/" : `/${locale}/`);
}

/** Wiki note URL (with base). `id` is content collection id. */
export function wikiHref(id: string): string {
  if (id === "index") return withBase("/wiki");
  return withBase(`/wiki/${id}`);
}

/**
 * Content-collection id → locale + path without locale prefix.
 * `zh/start/overview` → { locale: 'zh', rest: 'start/overview' }
 * `start/overview` → { locale: 'en', rest: 'start/overview' }
 */
export function parseNoteId(id: string): { locale: Locale; rest: string } {
  if (id === "index") return { locale: DEFAULT_LOCALE, rest: "index" };
  const parts = id.split("/");
  if (parts[0] && isLocale(parts[0]) && parts[0] !== "en") {
    return { locale: parts[0], rest: parts.slice(1).join("/") || "index" };
  }
  return { locale: DEFAULT_LOCALE, rest: id };
}

/** True if note belongs to locale (English notes have no locale prefix). */
export function noteMatchesLocale(id: string, locale: Locale): boolean {
  return parseNoteId(id).locale === locale;
}

/** Category key for a note within its locale (start/use/...). */
export function noteCategory(id: string): string {
  const { rest } = parseNoteId(id);
  if (rest === "index") return "overview";
  return rest.split("/")[0] || "overview";
}

/**
 * Switch the current path to another locale, preserving wiki page when possible.
 * Pathname may include base.
 */
export function switchLocalePath(pathname: string, target: Locale): string {
  const stripped = stripBase(pathname);
  const parts = stripped.split("/").filter(Boolean);

  // Home or locale home
  if (parts.length === 0) return homeHref(target);
  if (parts.length === 1 && isLocale(parts[0])) return homeHref(target);

  // Optional leading locale for non-wiki routes: /zh/tags, /ja/tag/foo
  let work = parts;
  if (work[0] && isLocale(work[0]) && work[0] !== "en") {
    work = work.slice(1);
  }

  // /wiki[/locale]/rest...
  if (work[0] === "wiki") {
    let restParts = work.slice(1);
    if (restParts[0] && isLocale(restParts[0])) {
      restParts = restParts.slice(1);
    }
    // wiki index
    if (restParts.length === 0) {
      if (target === DEFAULT_LOCALE) return withBase("/wiki");
      return homeHref(target);
    }
    const rest = restParts.join("/");
    const id = target === DEFAULT_LOCALE ? rest : `${target}/${rest}`;
    return wikiHref(id);
  }

  // /tags or /tag/x
  if (work[0] === "tags" || work[0] === "tag") {
    const rest = work.join("/");
    return withBase(
      target === DEFAULT_LOCALE ? `/${rest}` : `/${target}/${rest}`,
    );
  }

  return homeHref(target);
}

export function sortCategories<T extends { name: string }>(
  categories: T[],
): T[] {
  return [...categories].sort((a, b) => {
    const ia = (CATEGORY_ORDER as readonly string[]).indexOf(a.name);
    const ib = (CATEGORY_ORDER as readonly string[]).indexOf(b.name);
    const sa = ia === -1 ? 999 : ia;
    const sb = ib === -1 ? 999 : ib;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name);
  });
}

export function categoryLabel(locale: Locale, name: string): string {
  return UI[locale].categoryLabels[name] ?? name;
}
