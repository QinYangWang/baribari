<div align="center">

<img src="./apps/docs/public/brand/baribari-logo.png" alt="baribari" width="72">

# baribari

[ドキュメント](https://qinyangwang.github.io/baribari/ja/) · [インストール](https://qinyangwang.github.io/baribari/wiki/ja/start/install/) · [クイックスタート](https://qinyangwang.github.io/baribari/wiki/ja/start/quick-start/)

[English](./README.md) · [中文](./README.zh.md) · **日本語**

[![npm](https://img.shields.io/npm/v/baribari.svg)](https://www.npmjs.com/package/baribari)
[![Node](https://img.shields.io/node/v/baribari.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

</div>

---

<img src="./apps/docs/public/screenshots/demo-mode.png" alt="デモセッション: タイムライン、話者ラベル、原文と訳" width="960">

**会話を、共有できる持続的な知識へ。**

リアルタイム理解、話者の記憶、永続セッション、セルフホスト連携のためのローカル音声知能。

- **既定はローカル** — SenseVoice、Fun-ASR-Nano、ReazonSpeech、Silero VAD は端末上で動作。
- **誰が何を話したか** — 埋め込みで発話をラベル付け。グローバル名簿が常連を記憶。
- **セッションとして保存** — 再生、続行、訂正、翻訳、要約、共有が可能。
- **必要なときだけ AI** — 訂正・翻訳・要約は設定した OpenAI 互換プロバイダのみ。
- **ホスト 1 台、閲覧は多数** — LAN 経由で確定字幕をブラウザまたは CLI に共有。
- **文字起こしで終わらない** — 同じローカル音声基盤を検索、Headless 共有、翻訳音声、学習ツールへ拡張できます。

---

## インストール

```bash
npm install -g baribari
```

**Node.js 18+** が必要です。Windows はマイクとシステム音声に対応。Linux / macOS は現在マイク中心です。

## クイックスタート

```bash
baribari setup --download
baribari
```

初回セットアップで UI 言語、ASR モデル、話者モデルを選びます。あとは会議音声が取れる場所で `baribari` を実行します。

既定のライブ TUI は **legacy** です。`baribari --tui-backend rezi` または `BARIBARI_TUI=rezi` でモジュール化された Rezi 新UIを試せます（起動失敗時は legacy にフォールバック）。

```bash
baribari demo     # 内蔵サンプル会議
baribari doctor   # 音声とモデルの診断
```

## ドキュメント

セットアップ、キー操作、モデル、設定、トラブルシューティングは **[ドキュメント](https://qinyangwang.github.io/baribari/ja/)** にまとめています。

## 開発

```bash
git clone https://github.com/QinYangWang/baribari.git
cd baribari
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

貢献歓迎です。[GitHub](https://github.com/QinYangWang/baribari) で issue または PR を開いてください。

## ライセンス

[MIT](./LICENSE) © baribari contributors
