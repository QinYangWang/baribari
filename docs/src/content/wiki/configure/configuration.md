---
title: "Configuration"
description: "Config directory, VAD, env vars, and replace.json."
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["configure"]
isPinned: false
growthStage: "evergreen"
---
## Config directory

Default (override with `BARIBARI_CONFIG_DIR`):

```text
~/.config/baribari/
├── config.json      # persisted settings
├── replace.json     # local non-AI dictionary + cleanup
├── models/          # VAD / ASR / speaker models
├── sessions/        # auto-saved meetings
├── speakers/        # global voiceprint roster
└── recordings/      # legacy / fallback WAV dir
```

CLI flags always override `config.json`. UI language is stored as `uiLang` and chosen on first run if missing.

## First-run UI language

The picker lists `1) 中文` · `2) 日本語` · `3) English (default)`. Enter / empty keeps **English**. Numbers match the on-screen list.

## VAD presets

In the TUI: **Settings → VAD preset** (`←` / `→`). Picking a preset writes the numeric VAD fields (fine-tune afterward → shows as *custom*).

| Preset | min silence | max speech | Intent |
|--------|-------------|------------|--------|
| **Balanced** (default) | 0.6s | 30s | Fewer cuts, longer phrases |
| **Meeting** | 0.32s | 9s | Multi-speaker turn-taking (recommended) |
| **Low latency** | 0.22s / 0.28s | 8s / 12s | Faster finals; tuned per ASR engine |
| **Smooth** | 0.4s | 12s | Fewer fragments |
| **Aggressive** | 0.25s | 6s | Short cuts; lean on same-speaker merge |

CLI still accepts `--vad-min-silence` / `--vad-max-speech` / etc. for one-off overrides.

## Same-speaker turn merge

Short VAD finals from the **same speaker** can coalesce into one “turn” before AI correct/translate. Config key `speakerTurn` in `config.json`:

| Field | Default | Meaning |
|-------|---------|---------|
| `enabled` | `true` | Master switch |
| `maxGapSec` | `1.4` | Max gap between chunks still merged |
| `maxTurnSec` | `24` | Force-commit open turn |
| `idleMs` | `4000` | Quiet time after last chunk before commit + AI |
| `maxChunks` | `3` | Max micro-segments per turn |

## Local polish (no AI)

After ASR (and same-speaker turn merge), text is cleaned and passed through `replace.json` **before** optional AI:

```json
{
  "enabled": true,
  "replacements": [
    { "from": "日言語", "to": "日本語" },
    { "from": "ズーム", "to": "Zoom" }
  ]
}
```

Or a flat map: `{ "日言語": "日本語", "ズーム": "Zoom" }`. Longest match first. Built-in cleanup collapses repeated punctuation, applies NFKC, and normalizes CJK spacing. The file reloads by mtime — no restart required for new rules on the next segment.

## Environment

| Variable | Purpose |
|----------|---------|
| `BARIBARI_CONFIG_DIR` | Config / models / recordings root |
| `BARIBARI_UI_LANG` | `zh` \| `ja` \| `en` |
| `BARIBARI_AI_KEY` | Preferred API key |
| `OPENAI_API_KEY` | Fallback API key |
| `BARIBARI_NO_UPDATE_CHECK` | Set to `1` to disable the startup npm version check |

The version check runs once in the background at startup and silently ignores network errors.

## Custom model paths

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

Print resolved paths anytime:

```bash
baribari paths
```

See [Files & paths](/baribari/wiki/reference/files) and [Models & AI](/baribari/wiki/configure/models-ai).
