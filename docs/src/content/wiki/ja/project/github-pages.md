---
title: "GitHub Pages でドキュメントを公開"
description: "このドキュメントサイトのビルドと公開方法。"
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["project", "docs"]
isPinned: false
growthStage: "seedling"
---

このサイトは `docs/` 配下の [Veka](https://github.com/masmuss/veka) ベース Astro wiki で、GitHub Actions から公開します。

## 多言語

| パス | 言語 |
|------|------|
| `docs/src/content/wiki/**` | English（既定） |
| `docs/src/content/wiki/zh/**` | 中文 |
| `docs/src/content/wiki/ja/**` | 日本語 |

ノートは frontmatter 付き Markdown。フォルダはサイドバーに自動反映されます。

## デプロイ設定

| 項目 | 値 |
|------|-----|
| ソース | `docs/`（Astro / Veka） |
| ワークフロー | `.github/workflows/docs.yml` |
| URL 例 | `https://qinyangwang.github.io/baribari/` |
| `base` | `/baribari`（プロジェクト Pages） |

ユーザサイトやカスタムドメインにする場合は `docs/src/lib/site-config.ts` の `BASE` を変更します。

## 初回設定

1. `docs/` と `.github/workflows/docs.yml` を含む `main` を push。
2. GitHub → **Settings → Pages**。
3. **Build and deployment → Source** を **GitHub Actions** に。
4. Actions の **Docs** が成功することを確認。
5. Pages 設定の URL を開く。

## ローカル

```bash
npm run docs:install   # 初回: docs/ の依存を入れる
npm run docs:dev       # http://localhost:4321/baribari/
npm run docs:build     # 出力: docs/dist
npm run docs:preview   # ビルド結果を確認
```

## ワークフロー

1. Checkout + Node 22
2. `docs/` で `npm ci`（または `npm install`）
3. `npm run build`（Astro + Pagefind）
4. `docs/dist` を Pages artifact として upload
5. `actions/deploy-pages` で公開

## トラブル

| 症状 | 対処 |
|------|------|
| CSS/JS が 404 | `BASE` が `/baribari` か確認 |
| ワークフローが動かない | Pages の Source が GitHub Actions か確認 |
| 空のサイト | ビルド失敗ログを確認 |
