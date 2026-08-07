---
title: "TUI と i18n"
description: "legacy と Rezi TUI のレイアウト、ショートカット、ライブ字幕と確定字幕の状態、日中英 UI の切り替えを説明します。"
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["configure", "tui", "i18n"]
isPinned: false
growthStage: "evergreen"
---
## レイアウト

ライブ画面は、話者一覧、文字起こし（履歴と 1 行の live 状態）、サイドバー（デバイス、録音、共有）の三つの領域で構成されます。

![左側に話者、右側に認識中の日本語字幕を表示するライブ文字起こし画面](/baribari/screenshots/live-transcription.png)

`s` で設定を開くと、TUI を終了せずに表示言語、音声認識、AI、音声、共有、VAD の各項目を変更できます。

![表示言語、音声認識、AI、録音を変更する設定パネル](/baribari/screenshots/settings.png)

## TUI バックエンド

| バックエンド | 有効化 | 説明 |
|--------------|--------|------|
| **legacy**（既定） | `baribari` または `--tui-backend legacy` | 従来の自前レンダラ（現状フル機能） |
| **rezi**（任意） | `baribari --tui-backend rezi` または `BARIBARI_TUI=rezi` | Rezi モジュール化 UI。起動失敗時は legacy にフォールバック |

CLI が環境変数より優先。legacy と対等になるまで Rezi は opt-in です。


## Live vs final

| | UI | 保存 | 共有 | AI |
|--|-----|------|------|-----|
| partial | live を更新 | 否 | 既定否 | 否 |
| final | 履歴へ · live クリア | 是 | 是 | 是 |

SenseVoice の partial は、多くの場合「認識中…」などの状態表示であり、仮の文字起こしではありません。将来の online エンジンは、同じチャネルを使って実際の途中結果を送信できます。

**設定 → Speech ASR → ASRモデル** で `←` / `→` を押すと、SenseVoice、
Fun-ASR-Nano、ReazonSpeech（日本語特化）を切り替えられます。選択したモデルがない場合はダウンロード前に
確認し、その場で待つか、バックグラウンドで取得しながら文字起こしを続けるかを
選べます。ワイド表示では右の詳細欄に取得段階と進捗が表示され、現在の VAD 区切り
プリセット、終了無音、最大発話時間も確認できます。インストールが成功するまでは
現在のモデルを使い続けます。

## ライブキー（要約）

`p`/`Space` · `s` · `h` · `r` · `c` · `Tab` · `1–9` · `m` · `e` · ホイール/`g` · `q` — 詳細は README。

`baribari setup` を対話実行すると、SenseVoice（推奨）、Fun-ASR-Nano、ReazonSpeech、または3つすべて
からインストール対象を選べます。無人セットアップでは `--yes` を指定すると、現在の
認識モデルを維持したまま選択を省略します。

## UI 言語と認識言語

- **uiLang**: `zh|ja|en`（表示）  
- **lang**: ASR `auto|zh|en|ja|ko|yue`  

二つの設定は互いに独立しています。初回の選択画面には `1 中文 · 2 日本語 · 3 English (default)` と表示され、何も入力せずに Enter を押すと **English（3）** が選択されます。

## 開発

翻訳文字列は英語、中国語、日本語の三つのロケールで管理します。文字列を追加するときは三言語を同時に更新し、`pnpm check:i18n` でキーの一致を確認してください。
