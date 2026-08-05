---
title: "用 GitHub Pages 部署文档"
description: "如何构建并发布本站文档。"
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["project", "docs"]
isPinned: false
growthStage: "seedling"
---

本站是 `docs/` 下基于 [Veka](https://github.com/masmuss/veka) 的 Astro wiki，由 GitHub Actions 发布。

## 多语言

| 路径 | 语言 |
|------|------|
| `docs/src/content/wiki/**` | 英文（默认） |
| `docs/src/content/wiki/zh/**` | 中文 |
| `docs/src/content/wiki/ja/**` | 日本語 |

笔记为带 frontmatter 的 Markdown；文件夹会自动进入侧栏。

## 部署配置

| 项 | 值 |
|----|-----|
| 源码 | `docs/`（Astro / Veka） |
| 工作流 | `.github/workflows/docs.yml` |
| 典型 URL | `https://qinyangwang.github.io/baribari/` |
| `base` | `/baribari`（项目站） |

若改为用户站或自定义域名，请修改 `docs/src/lib/site-config.ts` 中的 `BASE`。

## 一次性设置

1. 将包含 `docs/` 与 `.github/workflows/docs.yml` 的 `main` 推送到 GitHub。
2. GitHub → **Settings → Pages**。
3. **Build and deployment → Source** 选择 **GitHub Actions**。
4. 打开 Actions → **Docs** 工作流，确认成功。
5. 在 Pages 设置页打开站点 URL。

## 本地命令

```bash
npm run docs:install   # 首次：安装 docs/ 依赖
npm run docs:dev       # http://localhost:4321/baribari/
npm run docs:build     # 输出：docs/dist
npm run docs:preview   # 预览构建结果
```

本地与线上使用相同 `base`，链接行为一致。

## 工作流步骤

1. Checkout + Node 22。
2. 在 `docs/` 执行 `npm ci`（或 `npm install`）。
3. `npm run build`（Astro + Pagefind）。
4. 上传 `docs/dist` 为 Pages artifact。
5. `actions/deploy-pages` 发布。

触发：`main` 上 `docs/**` 或工作流文件变更；也可手动 `workflow_dispatch`。

## 写文档

- 在 `docs/src/content/wiki/<分类>/` 添加 Markdown。
- frontmatter：`title`、`description`、`createdAt`、`updatedAt`、`tags`、`growthStage`。
- 优先使用 `[[page-name]]` 或 `/baribari/wiki/...`。
- 图片放在 `docs/public/`（例如 `docs/public/screenshots/`）。

## 排错

| 问题 | 处理 |
|------|------|
| CSS/JS 404 | `BASE` 错误，项目站应为 `/baribari` |
| 工作流未跑 | Pages 源仍是 branch 部署 |
| 空白站 | 构建失败，查看 workflow 日志 |
| 内容过旧 | 强刷缓存；确认 Action 部署了新 commit |
