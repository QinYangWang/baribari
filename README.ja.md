<div align="center">

# baribari

**ターミナルで会議をリアルタイム文字起こし**

SenseVoice · Silero VAD · 話者識別 · AI 校正/翻訳 · LAN 共有

[![npm](https://img.shields.io/npm/v/baribari.svg)](https://www.npmjs.com/package/baribari)
[![Node](https://img.shields.io/node/v/baribari.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

[English](./README.md) · [中文](./README.zh.md) · **日本語**

```bash
npm i -g baribari && baribari
```

</div>

---

## なぜ baribari？

| | |
|---|---|
| **会議向け TUI** | 話者 · リアルタイム転写 · デバイス/録音/共有 |
| **ローカル ASR** | SenseVoice + Silero VAD（クラウド不要で認識可） |
| **話者ラベル** | 声紋 + 複数窓投票 |
| **任意の AI** | OpenAI 互換の校正・翻訳 |
| **LAN 共有** | ホストが配信、ブラウザ/CLI で参加 |
| **ユーザー設定** | `~/.config/baribari` |

---

## 目次

- [インストール](#インストール)
- [クイックスタート](#クイックスタート)
- [CLI](#cli)
- [TUI キー](#tui-キー)
- [設定](#設定)
- [モデル](#モデル)
- [AI](#ai)
- [LAN 共有](#lan-共有)
- [開発](#開発)
- [ライセンス](#ライセンス)

---

## インストール

**要件:** Node.js **≥ 18**。マイク+システム音声は **Windows** が最も充実。

```bash
npm install -g baribari
```

---

## クイックスタート

```bash
baribari setup --download   # 表示言語 + モデル
baribari                    # 全画面 TUI
baribari doctor             # 診断
```

---

## CLI

```text
baribari [options]               ライブ転写（既定）
baribari setup [options]         モデル確認/DL
baribari paths | config          パス表示
baribari devices                 マイク一覧
baribari doctor                  診断
baribari demo                    ダミー TUI
baribari join <url>              LAN 共有に参加
baribari completion [shell]      bash | zsh | fish | powershell
baribari -h | -V                 ヘルプ / バージョン
```

| 主なオプション | 説明 |
|-----------------|------|
| `--lang` | 認識 `auto\|zh\|en\|ja\|ko\|yue` |
| `--ui-lang` | 表示 `zh\|ja\|en` |
| `--source` | `mic\|loopback\|both` |
| `--ai` / `--ai-translate` | AI 強化 / 翻訳先 |
| `--share` / `join` | LAN 共有 |
| `--vad-min-silence` | 無音で切る秒数（小さいほど頻繁） |

```bash
eval "$(baribari completion bash)"
```

詳細は [English README](./README.md) を参照。

---

## TUI キー

| キー | 動作 |
|------|------|
| `p` | 一時停止 |
| `s` | 設定 |
| `h` | 共有 |
| `r` | 録音 |
| `Tab` | フォーカス切替 |
| `q` | 終了 |

字幕は **VAD が区間を切った後** に出ます（逐語ストリームではありません）。

---

## 設定

```text
~/.config/baribari/
├── config.json
├── models/
└── recordings/
```

環境変数: `BARIBARI_CONFIG_DIR` · `BARIBARI_UI_LANG` · `BARIBARI_AI_KEY` / `OPENAI_API_KEY`

---

## モデル

```bash
baribari setup --download
baribari paths
```

---

## AI

```bash
export BARIBARI_AI_KEY=sk-...
baribari --ai --ai-translate en
```

OpenAI 互換 Chat Completions。原文と訳文は別行。

---

## LAN 共有

```bash
baribari --share
baribari join http://192.168.x.x:8787/
```

---

## 開発

```bash
npm install && npm run typecheck && npm run dev -- --demo
```

公開: `package.json` と同じ `v*` タグを push（Actions → npm）。

---

## ライセンス

[MIT](./LICENSE)

<div align="center">

[npm](https://www.npmjs.com/package/baribari) · [Issues](https://github.com/QinYangWang/baribari/issues)

</div>
