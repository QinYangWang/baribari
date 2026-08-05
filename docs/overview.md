# Overview

baribari is a **local-first meeting transcription CLI**. It listens on your machine, labels speakers, saves each meeting as a session you can reopen, and optionally corrects, translates, or summarizes with an OpenAI-compatible API you choose.

## What you get

| Capability | What it means |
|------------|----------------|
| **Local ASR** | SenseVoice, Fun-ASR-Nano, ReazonSpeech, and Silero VAD run on your machine |
| **Speakers** | Embeddings label each turn; a global roster remembers frequent attendees |
| **Sessions** | Reopen a meeting to play, continue, correct, translate, summarize, or share |
| **Optional AI** | Correction, translation, and summaries only when you configure a provider |
| **LAN share** | One host streams finalized captions; peers watch in a browser or CLI |
| **Terminal UI** | One focused TUI for captions, speakers, devices, recording, and status |

## How it fits together

```text
mic / loopback  →  VAD  →  ASR  →  speaker ID  →  local polish
                                              ↘ optional AI
                                              ↘ session files
                                              ↘ LAN share (finals only)
```

Subtitles appear **after VAD ends a speech segment**, not word-by-word. While a segment is decoding, the TUI may show a live status row; only **finals** are saved, shared, or sent to AI.

## Where next

- [Install](./install) — Node, npm, and first model download
- [Quick start](./quick-start) — setup, first meeting, demo
- [Live transcription](./live) — keys and day-to-day flow
- [Architecture](./architecture) — design deep dive
