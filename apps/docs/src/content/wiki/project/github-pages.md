---
title: "Deploying docs on GitHub Pages"
description: "How this docs site is built and deployed."
createdAt: 2026-08-05
updatedAt: 2026-08-06
tags: ["project", "docs"]
isPinned: false
growthStage: "seedling"
---
This site is a [Veka](https://github.com/masmuss/veka)-based Astro wiki under `apps/docs/`, published with GitHub Actions.

## Locales

| Path | Language |
|------|----------|
| `apps/docs/src/content/wiki/**` | English (default) |
| `apps/docs/src/content/wiki/zh/**` | 中文 |
| `apps/docs/src/content/wiki/ja/**` | 日本語 |

Notes are plain Markdown with Zod-validated frontmatter. Folders become the sidebar automatically.

## Deployment configuration

| Item | Value |
|------|--------|
| Source | `apps/docs/` (Astro / Veka) |
| Workflow | `.github/workflows/docs.yml` |
| Typical URL | `https://qinyangwang.github.io/baribari/` |
| `base` | `/baribari/` (project Pages) |

If the site is ever served from a **custom domain** or **user site**, change `BASE` in `apps/docs/src/lib/site-config.ts` to `""` or `/` as appropriate.

## One-time repo settings

1. Push `main` including `apps/docs/` and `.github/workflows/docs.yml`.
2. GitHub → **Settings → Pages**.
3. **Build and deployment → Source:** **GitHub Actions**.
4. Open Actions → workflow **Docs** → confirm green.
5. Open the site URL on the Pages settings screen.

## Local commands

```bash
pnpm install --frozen-lockfile   # workspace root (CLI + docs)
pnpm docs:dev                    # http://localhost:4321/baribari/
pnpm docs:build                  # output: apps/docs/dist
pnpm docs:preview                # serve the build
```

`base` matches production so links work the same locally and on Pages.

## How the workflow works

1. Checkout + setup pnpm and Node 22.
2. `pnpm install --frozen-lockfile` at the workspace root.
3. `pnpm docs:build` (Astro + Pagefind search index).
4. Upload `apps/docs/dist` as a Pages artifact.
5. `actions/deploy-pages` publishes the artifact.

Triggers: push to `main` when `apps/docs/**`, lockfile, or the workflow file changes; also `workflow_dispatch`.

## Writing docs

- Add a Markdown file under `apps/docs/src/content/wiki/<category>/`.
- Include frontmatter: `title`, `description`, `createdAt`, `updatedAt`, `tags`, `growthStage`.
- Prefer wiki links `[[page-name]]` or root-absolute `/baribari/wiki/...` paths.
- Put images in `apps/docs/public/` (for example `apps/docs/public/screenshots/`).

## Troubleshooting

| Issue | Fix |
|-------|-----|
| 404 on CSS/JS | Wrong `BASE` — must be `/baribari` for project Pages |
| Workflow skipped | Pages source still set to branch |
| Empty site | Build failed — open workflow logs |
| Old content | Hard-refresh; check Action deployed the new commit |
