# Deploying docs on GitHub Pages

This `docs/` directory is ready to publish to GitHub Pages using VitePress and GitHub Actions.

## Locales

| Path | Language |
|------|----------|
| `docs/*.md` | English (default) |
| `docs/zh/` | 中文 |
| `docs/ja/` | 日本語 |

The top-bar language switcher comes from VitePress `locales` in `docs/.vitepress/config.ts`.

## Deployment configuration

| Item | Value |
|------|--------|
| Source | `/docs` markdown + `docs/.vitepress/config.ts` |
| Workflow | `.github/workflows/docs.yml` |
| Typical URL | `https://qinyangwang.github.io/baribari/` |
| `base` | `/baribari/` (project Pages) |

If the repo is ever served from a **custom domain** or **user site** (`username.github.io`), change `base` in `docs/.vitepress/config.ts` to `'/'`.

## One-time repo settings

1. Push `main` including `docs/` and `.github/workflows/docs.yml`.
2. GitHub → **Settings → Pages**.
3. **Build and deployment → Source:** **GitHub Actions** (not “Deploy from a branch”).
4. Open the Actions tab → workflow **Docs** → confirm green.
5. Open the site URL shown on the Pages settings screen.

## Local commands

```bash
npm install
npm run docs:dev      # http://localhost:5173/baribari/
npm run docs:build    # output: docs/.vitepress/dist
npm run docs:preview  # serve the build
```

`docs:dev` uses the same `base` as production so links match Pages.

## How the workflow works

1. Checkout + setup Node 22.
2. `npm ci` (or `npm install`).
3. `npm run docs:build`.
4. Upload `docs/.vitepress/dist` as a Pages artifact.
5. `actions/deploy-pages` publishes the artifact.

Triggers: push to `main` when `docs/**` or the workflow file changes; also `workflow_dispatch`.

## Writing docs

- Add `docs/my-page.md` and a sidebar link in `docs/.vitepress/config.ts`.
- Keep user install/CLI tables in **README\***; keep deep design here.
- Prefer relative links between markdown files.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| 404 on CSS/JS | Wrong `base` — must be `/baribari/` for project Pages |
| Workflow skipped | Pages source still set to branch |
| Empty site | Build failed — open workflow logs |
| Old content | Hard-refresh; check Action deployed the new commit |
