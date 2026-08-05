---
title: "モデルと AI"
description: "ローカル ASR モデル 既定は SenseVoice です。TUI の Settings → Speech ASR → ASR model で ← / → により SenseVoice、Fun ASR Nano、ReazonSpeech を切り替えます。 コンポーネント 役割 入手 Silero "
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["configure", "models", "ai"]
isPinned: false
growthStage: "budding"
---
## ローカル ASR モデル

既定は SenseVoice です。TUI の **Settings → Speech ASR → ASR model** で `←` / `→` により SenseVoice、Fun-ASR-Nano、ReazonSpeech を切り替えます。

| コンポーネント | 役割 | 入手 |
|----------------|------|------|
| **Silero VAD** | 発話分割 | `baribari setup --download` |
| **SenseVoice** | 多言語 ASR（既定） | 同上 |
| **Fun-ASR-Nano** | 任意のローカル ASR（zh / en / ja） | 選択時にダウンロード |
| **ReazonSpeech** | 日本語向け Zipformer（約 162 MB） | 選択時にダウンロード |
| **3D-Speaker CAM++** | 話者埋め込み（軽量） | setup / Settings（`--skip-spk` で省略可） |
| **3D-Speaker ERes2Net-large** | 話者埋め込み（推奨） | 同上 |

未導入ならダウンロード確認が出ます。待っても、バックグラウンド取得中に文字起こしを続けても構いません。成功後にだけモデルが切り替わります。

```bash
baribari --asr-engine reazonspeech-ja
baribari --spk-engine eres2net-large
baribari --spk-threshold 0.60
```

### 手動ダウンロード

| ファイル | URL |
|----------|-----|
| `silero_vad.onnx` | [download](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx) |
| SenseVoice int8 | [download](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2) |
| Speaker CAM++ | [download](https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx) |
| Speaker ERes2Net-large | [download](https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_large_sv_zh-cn_3dspeaker_16k.onnx) |

リリース: [asr-models](https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models) · [speaker models](https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models)

## 任意の AI 強化

任意の **OpenAI 互換** Chat Completions API で後処理（OpenAI、Gemini OpenAI エンドポイント、DeepSeek、Groq、OpenRouter、Ollama など）。追加 SDK は不要です。

```bash
export BARIBARI_AI_KEY=sk-...
baribari --ai --ai-translate en --ai-model gpt-4o-mini
```

TUI：**Settings → AI** — ON/OFF、翻訳先、Provider プリセット、BASE_URL、API キー（マスク）、モデル。

| Provider | BASE_URL | 例モデル |
|----------|----------|----------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `google/gemini-2.0-flash-001` |
| Ollama（ローカル） | `http://127.0.0.1:11434/v1` | `qwen2.5:7b` |
| Custom | BASE_URL を手動編集 | — |

```bash
baribari --ai --ai-translate en \
  --ai-base-url https://generativelanguage.googleapis.com/v1beta/openai \
  --ai-model gemini-2.0-flash \
  --ai-key "$GEMINI_API_KEY"
```

- **訂正**はソース言語のまま
- **翻訳**は別行（原文を置き換えない）

`--ai-correct` / `--no-ai-correct` は翻訳と独立です。

## 話者の既定

選択中の埋め込みモデルとそのコサイン閾値（既定 CAM++ **0.55** / ERes2Net-large **0.45**）。声紋は**モデルごと**。詳細は [話者](/baribari/wiki/ja/use/speakers)。
