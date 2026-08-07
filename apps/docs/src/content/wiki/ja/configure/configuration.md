---
title: "設定"
description: "設定ディレクトリ、config.json、環境変数による上書きを理解し、モデル、録音、共有、VAD を安全に調整します。"
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["configure"]
isPinned: false
growthStage: "evergreen"
---
## 設定ディレクトリ

既定（`BARIBARI_CONFIG_DIR` で上書き可）：

```text
~/.config/baribari/
├── config.json      # 永続設定
├── replace.json     # ローカル非 AI 辞書と整形
├── models/          # VAD / ASR / 話者モデル
├── sessions/        # 自動保存された会議
├── speakers/        # グローバル声紋名簿
└── recordings/      # レガシー / フォールバック WAV
```

CLI フラグは常に `config.json` より優先されます。UI 言語は `uiLang` として保存され、初回に未設定なら選択します。

## 初回 UI 言語

一覧は `1) 中文` · `2) 日本語` · `3) English（既定）`。Enter / 空入力は **English**。番号は画面の並びと一致します。

## VAD プリセット

TUI：**Settings → VAD preset**（`←` / `→`）。プリセット選択で数値フィールドが書き込まれます（その後微調整 → *custom*）。

| プリセット | 最小無音 | 最大発話 | 意図 |
|------------|----------|----------|------|
| **Balanced**（既定） | 0.6s | 30s | 切分割減、長いフレーズ |
| **Meeting** | 0.32s | 9s | 複数話者のターン（推奨） |
| **Low latency** | 0.22s / 0.28s | 8s / 12s | より速い確定 |
| **Smooth** | 0.4s | 12s | 断片を減らす |
| **Aggressive** | 0.25s | 6s | 短い切断。同話者マージに依存 |

CLI の `--vad-min-silence` なども一回限りの上書きに使えます。

## 同一話者ターン結合

同一話者の短い VAD 確定を、AI 訂正/翻訳の前に 1 つの「ターン」にまとめられます。設定キー `speakerTurn`：

| フィールド | 既定 | 意味 |
|------------|------|------|
| `enabled` | `true` | マスタースイッチ |
| `maxGapSec` | `1.4` | まだ結合できる最大ギャップ |
| `maxTurnSec` | `24` | 開いているターンを強制コミット |
| `idleMs` | `4000` | 最後のチャンク後、コミット + AI までの静穏 |
| `maxChunks` | `3` | ターンあたり最大マイクロ区間 |

## ローカル整形（AI なし）

ASR（と同一話者ターン結合）のあと、テキストは `replace.json` を通り、**その後**任意で AI へ：

```json
{
  "enabled": true,
  "replacements": [
    { "from": "日言語", "to": "日本語" },
    { "from": "ズーム", "to": "Zoom" }
  ]
}
```

フラットな map も可。最長一致優先。組み込み整形は重複句読点、NFKC、CJK 空白を処理します。mtime で再読込 — 次のセグメントから新ルールが効きます。

## 環境変数

| 変数 | 用途 |
|------|------|
| `BARIBARI_CONFIG_DIR` | 設定 / モデル / 録音 root |
| `BARIBARI_UI_LANG` | `zh` \| `ja` \| `en` |
| `BARIBARI_AI_KEY` | 優先 API キー |
| `OPENAI_API_KEY` | フォールバック API キー |
| `BARIBARI_NO_UPDATE_CHECK` | `1` で起動時 npm バージョン確認を無効化 |

バージョン確認は起動時にバックグラウンドで一度だけ走り、ネットワークエラーは無視します。

## カスタムモデルパス

```json
{
  "modelsDir": "/path/to/models",
  "spkEngine": "eres2net-large",
  "models": {
    "vad": "/path/to/silero_vad.onnx",
    "senseVoiceDir": "/path/to/sense-voice-dir",
    "spkEres2netLarge": "/path/to/eres2net.onnx",
    "spkCampplus": "/path/to/campplus.onnx"
  }
}
```

解決済みパスの表示：

```bash
baribari paths
```

[ファイルとパス](/baribari/wiki/ja/reference/files) と [モデルと AI](/baribari/wiki/ja/configure/models-ai) も参照。
