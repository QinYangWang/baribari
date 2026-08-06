// @ts-check
import { unified } from "@astrojs/markdown-remark";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { fileURLToPath } from "url";
import path from "path";
import pagefind from "astro-pagefind";
import { SITE, BASE } from "./src/lib/site-config";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import wikiLink from "remark-wiki-link";
import { wikiLinkOptions } from "./src/lib/wiki/wiki-link-resolver.mjs";
import { remarkCustomSyntax } from "./src/lib/wiki/remark-custom-syntax.mjs";
import { remarkAlert } from "remark-github-blockquote-alert";
import { remarkDefinitionList } from "remark-definition-list";
import mdx from "@astrojs/mdx";

import sitemap from "@astrojs/sitemap";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  site: SITE.url,
  base: BASE,
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  },
  integrations: [pagefind(), mdx(), sitemap()],
  markdown: {
    processor: unified({
      remarkPlugins: [
        remarkMath,
        [wikiLink, wikiLinkOptions],
        remarkDefinitionList,
        remarkCustomSyntax,
        remarkAlert,
      ],
      rehypePlugins: [rehypeKatex],
    }),
    shikiConfig: {
      themes: {
        dark: "github-dark",
        light: "github-light",
      },
    },
  },
});
