---
title: "CLI リファレンス"
description: "baribari のコマンド、共通オプション、setup、session、resume、join、シェル補完の使い方をまとめます。"
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["reference", "cli"]
isPinned: true
growthStage: "evergreen"
---
```text
baribari [options]                 ライブ文字起こし開始（既定）
baribari setup [options]           モデル確認 / ダウンロード
baribari paths | config            設定とモデルパスを表示
baribari devices                   マイク一覧
baribari doctor                    環境診断
baribari session list              保存済み会議一覧
baribari session rm <id>           セッション削除
baribari session path <id>         セッションディレクトリ表示
baribari resume [id]               セッション閲覧/再生（既定: demo）
baribari demo                      resume demo と同じ
baribari join <url>                LAN 共有に参加（受信のみ）
baribari completion [shell]        bash | zsh | fish | powershell
baribari -h | -V                   ヘルプ / バージョン
```

## よく使うオプション（ライブ）

| フラグ | 説明 |
|--------|------|
| `--lang <lang>` | ASR: `auto` \| `zh` \| `en` \| `ja` \| `ko` \| `yue` |
| `--asr-engine <engine>` | `sensevoice` \| `funasr-nano` \| `reazonspeech-ja` |
| `--ui-lang <lang>` | UI: `zh` \| `ja` \| `en` |
| `--source <src>` | `mic` \| `loopback` \| `both`（Windows） |
| `--device <id>` | `baribari devices` の index またはデバイス名 |
| `-o, --output <file>` | 字幕テキストをファイルへ追記 |
| `--no-spk` | 話者識別オフ |
| `--spk-engine <engine>` | `campplus` \| `eres2net-large` |
| `--spk-threshold <n>` | 一致閾値 `0–1` |
| `--no-tui` | プレーンテキスト |
| `--record <path>` | 起動時に WAV 録音開始 |
| `--record-dir <dir>` | 既定録音ディレクトリ |
| `--ai` / `--no-ai` | AI 強化 |
| `--ai-correct` / `--no-ai-correct` | AI 誤字訂正 |
| `--ai-translate <lang>` | 翻訳先（空 = オフ） |
| `--ai-base-url <url>` | OpenAI 互換 base URL |
| `--ai-model <id>` | モデル id |
| `--ai-key <key>` | API キー（環境変数 `BARIBARI_AI_KEY` 推奨） |
| `--share` / `--share-port <n>` | LAN 共有ホスト |
| `--join <url>` | 共有に参加 |
| `--vad-threshold <n>` | Silero 発話確率閾値 |
| `--vad-min-silence <sec>` | 分割用無音長 |
| `--vad-min-speech <sec>` | これより短いバーストを破棄 |
| `--vad-max-speech <sec>` | 長い独白を強制切断 |
| `--demo` | `baribari resume demo` と同じ |

## setup

```bash
baribari setup
baribari setup --download
baribari setup --download -y
baribari setup --skip-spk
baribari setup --models-dir D:/m
```

## セッション

```bash
baribari session list
baribari session path ses_m5abc
baribari session rm ses_full_exact_id
baribari session rm ses_xxx -y
baribari session rm ses_ab --allow-prefix
baribari resume demo
baribari resume ses_m5abc
```

削除は既定で**完全なセッション id** が必要です。プレフィックスは一意なときだけ `--allow-prefix`。

## 例

```bash
baribari --lang ja --ui-lang en
baribari --source both -o meeting.txt
baribari --ai --ai-base-url https://api.openai.com/v1 --ai-translate en
baribari --share --share-port 8788
baribari join http://192.168.1.10:8787/
baribari --vad-min-silence 0.35 --spk-threshold 0.60
baribari --asr-engine reazonspeech-ja
```
