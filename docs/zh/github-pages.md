# 用 GitHub Pages 部署文档

该 `docs/` 目录已配置为通过 VitePress 和 GitHub Actions 发布到 GitHub Pages。

## 地址

| 项 | 值 |
|----|-----|
| 源 | `/docs` + `docs/.vitepress/config.ts` |
| 工作流 | `.github/workflows/docs.yml` |
| 典型 URL | `https://qinyangwang.github.io/baribari/` |
| `base` | `/baribari/`（项目站） |

用户站或自定义域名时把 `base` 改为 `'/'`。

## 一次性设置

1. 将包含 `docs/` 和工作流文件的 `main` 分支推送到 GitHub。  
2. 在 **Settings → Pages → Source** 中选择 **GitHub Actions**。  
3. 在 Actions 页面确认 **Docs** 工作流执行成功。  
4. 打开 Pages 设置页面显示的站点 URL。  

## 本地

```bash
npm run docs:dev      # http://localhost:5173/baribari/
npm run docs:build
npm run docs:preview
```

## 多语言

- 英文：`docs/*.md`（root）  
- 中文：`docs/zh/`  
- 日文：`docs/ja/`  
- 顶栏语言切换由 VitePress `locales` 提供  

## 排错

| 现象 | 处理 |
|------|------|
| CSS/JS 404 | `base` 是否为 `/baribari/` |
| 工作流不跑 | Pages 源是否仍是 branch |
| 空站 | 看 build 日志 |
