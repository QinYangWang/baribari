---
title: "Overview"
description: "What baribari is: local speech workspace for meetings, speakers, and sessions."
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["start", "product"]
isPinned: true
growthStage: "evergreen"
---
baribari is a **local speech workspace** that starts with meetings. Today it listens on your machine, labels speakers, and saves a session you can reopen. The same foundation is being shaped for searchable meeting knowledge, headless team sharing, translated voice, and speaking practice.

The product promise is simple: **understand the conversation now, keep its context useful later, and retain control of the audio throughout.**

## What you get

| Capability | What it means |
|------------|----------------|
| **Local ASR** | SenseVoice, Fun-ASR-Nano, ReazonSpeech, and Silero VAD run on your machine |
| **Speakers** | Embeddings label each turn; a global roster remembers frequent attendees |
| **Sessions** | Reopen a meeting to play, continue, correct, translate, summarize, or share |
| **Optional AI** | Correction, translation, and summaries only when you configure a provider |
| **LAN share** | One host streams finalized captions; peers watch in a browser or CLI |
| **Focused client** | One TUI for captions, speakers, devices, recording, and status |

## Where it is going

| Layer | Direction |
|-------|-----------|
| **Understand now** | Lower-latency captions, stronger Japanese recognition, honest speaker confidence |
| **Remember later** | Search, editing, exports, reprocessing, and durable meeting context |
| **Share safely** | One self-hosted engine serving browsers, APIs, and automations |
| **Act through speech** | Experiments in translated voice, overlays, and pronunciation coaching |

The [roadmap](/baribari/wiki/project/roadmap) separates committed priorities from experiments so future direction does not read as a promise that every feature exists today.

## How it fits together

```text
mic / loopback  →  VAD  →  ASR  →  speaker ID  →  local polish
                                              ↘ optional AI
                                              ↘ session files
                                              ↘ LAN share (finals only)
```

Subtitles appear **after VAD ends a speech segment**, not word-by-word. While a segment is decoding, the TUI may show a live status row; only **finals** are saved, shared, or sent to AI.

## Where next

- [Install](/baribari/wiki/start/install) — Node, npm, and first model download
- [Quick start](/baribari/wiki/start/quick-start) — setup, first meeting, demo
- [Live transcription](/baribari/wiki/use/live) — keys and day-to-day flow
- [Architecture](/baribari/wiki/project/architecture) — design deep dive
