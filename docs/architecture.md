# Architecture

> Product overview: [Home](./). This page is the engineering map.

## Goals

- **Local-first** speech-to-text for meetings (no cloud required for ASR).
- A terminal interface designed for meetings, with speakers, transcripts, and device and sharing status in one place.
- Persistent sessions stored under the user configuration directory, with optional LAN sharing.
- Optional OpenAI-compatible correction, translation, and summarization that never overwrite the original ASR text.

## Runtime stack

| Layer | Choice |
|-------|--------|
| Language | TypeScript → Node ≥ 18 (`type: module`) |
| CLI | `commander` |
| ASR / VAD / spk | `sherpa-onnx-node` (SenseVoice, Fun-ASR-Nano, ReazonSpeech, Silero VAD, 3D-Speaker CAM++ / ERes2Net-large) |
| Capture | `node-cpal` + `bionic-audio` (mic; Windows loopback/both) |
| Share | `ws` + small HTTP page |
| TUI | Custom ANSI (`src/tui.ts`), not Ink/Blessed |

## High-level flow

```text
┌─────────────┐    PCM 16 kHz     ┌──────────────┐
│ audio-capture│ ───────────────► │  Silero VAD  │
└─────────────┘                   └──────┬───────┘
                                         │ speech segment
                                         ▼
                                  ┌──────────────┐
                                  │ selected ASR │  offline decode
                                  └──────┬───────┘
                                         │ text + audio slice
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
             speaker-tracker      speaker-turn          postprocess
             (embed / roster)     (same-spk merge)      (replace.json)
                    │                    │                    │
                    └────────────────────┼────────────────────┘
                                         ▼
                              emit Segment (final)
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              ▼                          ▼                          ▼
           TUI list                  session.jsonl              share WS
              │                          │
              ▼                          ▼
         optional AI                resume-tui / export
      (correct/translate)
```

**Partial and final events:** while a VAD segment is being decoded, the UI may show one **live** status row (`kind: "partial"`). Once decoding finishes, a final segment replaces that status. Only final segments are saved, shared, and sent to AI.

LAN participants see finalized captions and translations in a browser without running ASR locally:

![Browser view of a shared live session with speaker-labelled captions and translations](/screenshots/web-share.png)

## Source map

| Path | Role |
|------|------|
| `src/index.ts` | CLI entry, wiring, live session loop |
| `src/transcribe.ts` | VAD + ASR pump, record, hot-reload VAD/source |
| `src/tui.ts` | Live fullscreen UI + settings |
| `src/resume-tui.ts` | Session browser, playback, continue, AI tools |
| `src/session.ts` | Paths, meta, jsonl, multi-clip audio, delete safety |
| `src/speaker-tracker.ts` | Template-bank ID + multi-window voting + hysteresis |
| `src/speaker-models.ts` | Speaker embedding catalog (paths, defaults) |
| `src/speaker-library.ts` | Global `roster.json` |
| `src/speaker-turn.ts` | Same-speaker coalesce before AI |
| `src/postprocess.ts` | Local dict / cleanup |
| `src/ai.ts` | Chat completions + provider presets |
| `src/share-server.ts` / `share-client.ts` | LAN host / join |
| `src/setup.ts` | First-run UI lang + model download |
| `src/settings.ts` | `config.json` load/save |
| `src/paths.ts` | Config/models/session roots |
| `src/i18n/` | zh / ja / en message trees |
| `docs/` | This design site (VitePress) |

## Config layout

Default root: `~/.config/baribari` (`BARIBARI_CONFIG_DIR`).

```text
config.json       # lang, uiLang, vad, speakerTurn, ai, share, models…
replace.json      # non-AI dictionary
models/           # silero_vad, sense-voice, 3dspeaker…
sessions/<id>/    # meta.json, transcript.jsonl, speakers.json, audio*.wav
speakers/roster.json
recordings/       # legacy / fallback WAV dir
```

CLI flags always override `config.json` for that process.

## Process boundaries

- **One Node process** owns capture + ASR + TUI (or plain `--no-tui` stdout).
- **LAN peers** do not run ASR; they receive finalized segment events.
- **AI processing** runs asynchronously after a final segment, or after a merged speaker turn is committed. An AI failure does not interrupt transcription.

## Non-goals (current)

- True token-streaming ASR (SenseVoice is offline; live row is status / future online engine).
- Built-in virtual-mic dubbing / TTS.
- Full offline speaker diarization as the live path (see [roadmap](./roadmap.md)).
