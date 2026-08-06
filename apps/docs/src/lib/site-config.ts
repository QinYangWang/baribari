export const SITE = {
  name: "baribari",
  title: "baribari",
  description:
    "Local-first meeting transcription in your terminal — ASR, speakers, sessions, optional AI.",
  author: "baribari contributors",
  url: "https://qinyangwang.github.io/baribari",
  image: "/screenshots/demo-mode.png",
  favicon: "/favicon.png",
};

/** Site base path (GitHub project Pages). No trailing slash except root. */
export const BASE = "/baribari";

/** Join BASE with a root-absolute path like `/wiki/foo`. */
export function withBase(pathname: string = "/"): string {
  if (!pathname || pathname === "/") return `${BASE}/`;
  if (/^https?:\/\//i.test(pathname)) return pathname;
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${BASE}${path}`;
}
