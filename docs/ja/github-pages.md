# GitHub Pages でドキュメントを公開

この `docs/` ディレクトリは、VitePress と GitHub Actions を使って GitHub Pages に公開できます。

| | |
|--|--|
| URL 例 | `https://qinyangwang.github.io/baribari/` |
| base | `/baribari/` |
| ワークフロー | `.github/workflows/docs.yml` |

## 初回設定

1. `docs/` とワークフローを含む `main` ブランチを push します。  
2. **Settings → Pages → Source** で **GitHub Actions** を選択します。  
3. Actions 画面で **Docs** ワークフローが成功したことを確認します。  
4. Pages の設定画面に表示された URL を開きます。  

## ローカル

```bash
npm run docs:dev
npm run docs:build
```

## 多言語

- 英語: `docs/*.md`  
- 中国語: `docs/zh/`  
- 日本語: `docs/ja/`  

## トラブル

CSS や JavaScript が 404 になる場合は `base` を確認してください。ページが空の場合は Actions のビルドログを確認し、古い内容が表示される場合はブラウザを再読み込みします。
