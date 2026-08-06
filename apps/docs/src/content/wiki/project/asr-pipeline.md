---
title: "ASR pipeline"
description: "Capture → VAD → ASR → speakers → polish → AI."
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["project", "asr"]
isPinned: false
growthStage: "budding"
---
## Stages (live)

1. **Capture** — mic / loopback / both → float32 PCM @ 16 kHz.
2. **VAD (Silero)** — endpointing into speech chunks (`src/transcribe.ts`).
3. **ASR (SenseVoice)** — offline decode of each chunk; language `auto|zh|en|ja|ko|yue`.
4. **Speaker ID** — selected embedding model on the chunk; multi-window vote + template bank (`speaker-tracker.ts`).
5. **Turn merge** — optional coalesce of same-speaker micro-finals (`speaker-turn.ts`).
6. **Postprocess** — cleanup + `replace.json` (`postprocess.ts`).
7. **Emit final** — TUI history, `transcript.jsonl`, LAN share.
8. **AI** (optional) — correct and/or translate; never overwrites `text` with translation.

While step 3 runs, the UI may show a **live** “Recognizing…” status (`kind: "partial"`). This is a progress indicator, not an invented transcript.

## Why captions feel “late”

SenseVoice decodes complete speech segments rather than individual streaming tokens. Text appears only after VAD ends a segment—because it detects silence or reaches the maximum duration—and the CPU finishes decoding it. Optional AI adds another processing step.

| Lever | Default (Balanced) | Snappier meeting |
|-------|--------------------|------------------|
| `minSilenceDuration` | 0.6 s | 0.25–0.35 s |
| `maxSpeechDuration` | 30 s | 6–9 s |
| VAD preset | Balanced | **Meeting** / Aggressive |
| AI translate | off | leave off if latency-critical |

## VAD presets

Defined in `src/types.ts` as `VAD_PRESETS`. TUI: Settings → VAD preset.

| Id | minSilence | maxSpeech | Notes |
|----|------------|-----------|--------|
| `balanced` | 0.6 | 30 | Stock default |
| `meeting` | 0.32 | 9 | Multi-speaker turn-taking |
| `lowLatency` | 0.22 / 0.28 | 8 / 12 | SenseVoice / Fun-ASR-Nano model-aware tuning |
| `smooth` | 0.4 | 12 | Fewer fragments |
| `aggressive` | 0.25 | 6 | Short cuts; rely on turn merge |

If you change an individual value after selecting a preset, the active preset is shown as `custom`.

CLI one-offs: `--vad-threshold`, `--vad-min-speech`, `--vad-min-silence`, `--vad-max-speech`, `--vad-window`.

## Same-speaker turn merge

Config: `speakerTurn` in `config.json` / `DEFAULT_SPEAKER_TURN`.

| Field | Default | Role |
|-------|---------|------|
| `enabled` | `true` | Master switch |
| `maxGapSec` | `1.4` | Max gap between chunks to still merge |
| `maxTurnSec` | `24` | Force commit |
| `idleMs` | `4000` | Quiet after last chunk before commit + AI |
| `maxChunks` | `3` | Max micro-segments per turn |

**Why merge turns:** this allows one AI request per conversational turn instead of one request for every short VAD segment. The UI can show merged draft text while AI waits for the turn to be committed.

## Local polish (`replace.json`)

After turn merge, before AI:

- Whitespace / repeated punctuation / NFKC-ish cleanup.
- Dictionary replacements (array of `{from,to}` or flat map); longest match first.
- Reloaded by mtime on next segment (no restart).

## AI stage

- OpenAI-compatible `chat/completions`.
- Flags: `--ai` / `--no-ai`, `--ai-correct` / `--no-ai-correct`, `--ai-translate <lang>`.
- TUI Provider presets set `baseUrl` + example model (OpenAI, Gemini OpenAI-compat URL, DeepSeek, Groq, OpenRouter, Ollama, …).
- **corrected** stays source language; **translation** is a separate field/line.

## Engines (today vs future)

| Engine | Mode | In tree |
|--------|------|---------|
| SenseVoice | Offline + VAD (simulated streaming) | **Default** |
| Fun-ASR-Nano | Offline + VAD; Chinese, English, Japanese | Available |
| ReazonSpeech | Offline Zipformer transducer; Japanese optimized | Available |
| Online zipformer | True partials | Roadmap |

See [roadmap](/baribari/wiki/project/roadmap).
