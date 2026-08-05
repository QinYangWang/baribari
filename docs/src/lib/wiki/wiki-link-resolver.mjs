import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Keep in sync with docs/src/lib/site-config.ts BASE */
const BASE = "/baribari";
const LOCALES = new Set(["zh", "ja"]);

function isMarkdownFile(file) {
  return (
    typeof file === "string" && (file.endsWith(".md") || file.endsWith(".mdx"))
  );
}

/**
 * Map basename -> preferred English slug, plus full slug keys.
 * Locale-specific [[links]] still resolve via basename to EN by default;
 * for zh/ja notes prefer linking with full paths or markdown links.
 */
function buildWikiLinksMap() {
  const wikiLinksMap = new Map();
  try {
    const contentWikiPath = path.resolve(__dirname, "../../content/wiki");
    const wikiFiles = fs.readdirSync(contentWikiPath, { recursive: true });

    const entries = [];
    for (const file of wikiFiles) {
      if (!isMarkdownFile(file)) continue;
      const norm = String(file).split(path.sep).join("/");
      if (norm.includes("/blog/") || norm.startsWith("blog/")) continue;
      const slug = norm.replace(/\.(md|mdx)$/, "");
      const basename = path.posix.basename(slug);
      entries.push({ basename: basename.toLowerCase(), slug });
    }

    // English first so bare [[overview]] → start/overview
    entries.sort((a, b) => {
      const aLoc = LOCALES.has(a.slug.split("/")[0]) ? 1 : 0;
      const bLoc = LOCALES.has(b.slug.split("/")[0]) ? 1 : 0;
      return aLoc - bLoc;
    });

    for (const { basename, slug } of entries) {
      if (!wikiLinksMap.has(basename)) {
        wikiLinksMap.set(basename, slug);
      }
      wikiLinksMap.set(slug.toLowerCase(), slug);
    }
  } catch (e) {
    console.warn("Failed to read wiki files for wikiLinksMap", e);
  }
  return wikiLinksMap;
}

const wikiLinksMap = buildWikiLinksMap();

export const wikiLinkOptions = {
  pageResolver: (name) => {
    return [name.replace(/ /g, "-").toLowerCase()];
  },
  hrefTemplate: (permalink) => {
    const key = permalink.replace(/ /g, "-").toLowerCase();
    const resolved = wikiLinksMap.get(key) || permalink;
    return `${BASE}/wiki/${resolved}`;
  },
};
