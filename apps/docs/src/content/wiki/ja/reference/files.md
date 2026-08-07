---
title: "ファイルとパス"
description: "設定、モデル、セッション、録音、グローバル声紋名簿の既定パス、形式、上書き規則を説明します。"
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["reference", "paths"]
isPinned: false
growthStage: "evergreen"
---
## 設定 root

既定: `~/.config/baribari/`  
上書き: `BARIBARI_CONFIG_DIR`

```text
~/.config/baribari/
├── config.json
├── replace.json
├── models/
├── sessions/<session-id>/
├── speakers/roster.json
└── recordings/
```

解決済みパス：

```bash
baribari paths
# 別名: baribari config
```

## セッション構成

```text
~/.config/baribari/sessions/<session-id>/
  meta.json
  transcript.jsonl
  speakers.json
  audio.wav           # 録音 (r) を有効にしたときのみ
  audio-part-*.wav
```

セッション ID は `ses_…` 形式。表示名は再開モードで `e` により変更できます。

## グローバル話者

```text
~/.config/baribari/speakers/roster.json
```

声紋は**埋め込みモデルごと**に保存。詳細は [話者](/baribari/wiki/ja/use/speakers)。

## ローカル辞書

```text
~/.config/baribari/replace.json
```

ASR 後の非 AI 置換。[設定](/baribari/wiki/ja/configure/configuration) を参照。

## このサイトの公開

設計ドキュメントは `apps/docs/` にあり、Veka (Astro) でビルドします。

```bash
pnpm docs:dev
pnpm docs:build    # → apps/docs/dist
```

GitHub Pages: `.github/workflows/docs.yml` がある状態で **Settings → Pages → Source: GitHub Actions** を有効化。

サイト: `https://qinyangwang.github.io/baribari/ja/`
