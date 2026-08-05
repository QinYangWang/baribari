import { BASE } from "@/lib/site-config";

export type Breadcrumb = {
  label: string;
};

/**
 * Breadcrumbs from pathname, skipping site base and the `wiki` segment.
 * `/baribari/wiki/zh/start/overview` → zh · start · overview
 */
export function generateBreadcrumbs(path: string): Breadcrumb[] {
  let pathname = path;
  const base = BASE.replace(/\/$/, "");
  if (base && (pathname === base || pathname.startsWith(`${base}/`))) {
    pathname = pathname.slice(base.length) || "/";
  }

  const segments = pathname.split("/").filter(Boolean);
  // drop leading "wiki"
  if (segments[0] === "wiki") segments.shift();

  return segments.map((segment) => ({
    label: segment.charAt(0).toUpperCase() + segment.slice(1),
  }));
}
