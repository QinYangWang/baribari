# アーキテクチャ

## 製品の境界

- **入力を管理する：** ローカル ASR が既定で、クラウド AI は明示的かつ任意です。
- **その場を理解する：** 字幕、話者、デバイス、共有状態を一貫したクライアントに集約します。
- **文脈を残す：** 会議は使い捨ての端末出力ではなく、再開できるセッションです。
- **出力を開く：** セッションとバージョン付き字幕イベントを、検索、Headless 共有、自動化、音声アプリへつなげます。
- **出典を守る：** 訂正と翻訳は ASR 原文を上書きしません。

TUI は最初のクライアントであって、アーキテクチャの境界ではありません。長期的な境界はローカル音声エンジン、永続セッション、安定イベント契約です（[ロードマップ](./roadmap)）。

## ランタイム

| 層 | 選択 |
|----|------|
| 言語 | TypeScript → Node ≥ 18 |
| CLI | `commander` |
| ASR / VAD / 声紋 | `sherpa-onnx-node` |
| 収録 | `node-cpal` + `bionic-audio` |
| 共有 | `ws` + 簡易 HTTP |
| TUI | 自前 ANSI（`src/tui.ts`） |

## データフロー

```text
収録 → Silero VAD → 選択した ASR（オフライン区間）
     → 話者 embedding / 名簿
     → 同一話者ターン結合
     → replace.json
     → final → TUI / session / LAN
     → 任意 AI
```

デコード中は **live** 行に進行状況（`partial`）を表示できます。認識が完了した **final** だけが保存、共有、AI 処理の対象になります。

LAN 上の参加者は、ASR を自分の PC で実行しなくても、確定字幕と翻訳をブラウザで確認できます。

![話者別の確定字幕と翻訳を表示するブラウザ共有画面](/screenshots/web-share.png)

## ソース対応

| パス | 役割 |
|------|------|
| `index.ts` | CLI / ライブ配線 |
| `transcribe.ts` | VAD+ASR |
| `tui.ts` / `resume-tui.ts` | UI |
| `session.ts` | セッションファイル |
| `speaker-*.ts` | 話者 |
| `postprocess.ts` / `ai.ts` | 整形 / LLM |
| `share-*.ts` | LAN |
| `i18n/` | zh · ja · en |
| `docs/` | 本サイト |

## 設定レイアウト

`~/.config/baribari`（`BARIBARI_CONFIG_DIR`）：`config.json` · `replace.json` · `models/` · `sessions/` · `speakers/roster.json`。

CLI オプションを指定した場合、その実行中は `config.json` よりも CLI の値が優先されます。

## 境界と非目標

- 単一 Node プロセスが収録+ASR+TUI。
- ピアは ASR せず final のみ受信。
- 真のトークンストリーミング ASR・内蔵 TTS 同通・ライブ専用フル diarization は現状対象外（[ロードマップ](./roadmap.md)）。
