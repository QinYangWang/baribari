<div align="center">

# baribari

**Real-time meeting transcription in your terminal**

SenseVoice · Silero VAD · Speaker ID · AI correct/translate · LAN share

<img src="./docs/public/screenshots/demo-mode.png" alt="Demo session with a timeline, speaker labels, original text, and translations" width="960">

[![npm](https://img.shields.io/npm/v/baribari.svg)](https://www.npmjs.com/package/baribari)
[![Node](https://img.shields.io/node/v/baribari.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**English** · [中文](./README.zh.md) · [日本語](./README.ja.md)

[Documentation](https://qinyangwang.github.io/baribari/) · [Design docs](./docs/)

**Bash**

```bash
npm i -g baribari && baribari setup --download && baribari
```

**PowerShell**

```powershell
npm i -g baribari; baribari setup --download; baribari
```

**CMD**

```bat
npm i -g baribari & baribari setup --download & baribari
```

</div>

---

## Why baribari?

| Feature | What you get |
|---------|----------------|
| **Meeting-first TUI** | See speakers, live transcripts, devices, recording, and sharing status in one place |
| **Local speech recognition** | Switch between SenseVoice and Fun-ASR-Nano; both run locally through sherpa-onnx with Silero VAD |
| **Speaker labels** | Voice embeddings distinguish speakers, while a global roster recognizes frequent attendees in later meetings |
| **Optional AI** | Use an OpenAI-compatible API for correction, translation, and summaries |
| **Saved sessions** | Reopen transcripts to play audio, continue recording, translate, summarize, or share |
| **LAN sharing** | One computer transcribes; others follow captions in a browser or CLI |
| **Local storage** | Configuration, models, and sessions live under `~/.config/baribari` by default |

---

## Screenshots

| Live transcription | Settings |
|:---:|:---:|
| ![Live transcription view with speaker list and incoming Japanese transcript](./docs/public/screenshots/live-transcription.png) | ![Settings panel for interface language, speech recognition, AI, and audio](./docs/public/screenshots/settings.png) |
| **Demo and resume mode** | **Web sharing** |
| ![Demo session with a timeline, speaker labels, original text, and translations](./docs/public/screenshots/demo-mode.png) | ![Browser view of a shared live session with speaker-labelled captions and translations](./docs/public/screenshots/web-share.png) |

---

## Table of contents

- [Install](#install)
- [Quick start](#quick-start)
- [CLI](#cli)
- [TUI keys](#tui-keys)
- [Configuration](#configuration)
- [Models](#models)
- [AI enhancement](#ai-enhancement)
- [LAN share](#lan-share)
- [How transcription timing works](#how-transcription-timing-works)
- [Documentation site](#documentation-site)
- [Development](#development)
- [License](#license)

---

## Install

**Requirements:** Node.js **≥ 18**. **Windows** supports the most complete audio capture, including microphone and system audio. Linux and macOS primarily support microphone capture where `node-cpal` is available.

```bash
npm install -g baribari
```

Or from source:

```bash
git clone https://github.com/QinYangWang/baribari.git
cd baribari
npm install
npm run build
npm link
```

> **Shell note:** chain with `&&` (bash/zsh/fish), `;` (PowerShell), or `&` (cmd). Multi-line blocks below are fine everywhere.

---

## Quick start

```bash
# 1) First run: pick UI language + download models
baribari setup --download

# 2) Start live transcription (fullscreen TUI)
baribari
```

Enable only the optional features you need:

```bash
baribari --source loopback --ai --ai-translate en --share
```

If something is not working, check the environment with:

```bash
baribari doctor
```

---

## CLI

```text
baribari [options]                 Start live transcription (default)
baribari setup [options]           Check / download models
baribari paths | config            Print config & model paths
baribari devices                   List microphones
baribari doctor                    Diagnose environment
baribari session list              List saved meetings
baribari session rm <id>           Delete a session
baribari resume [id]               Browse/replay a session (default: demo)
baribari demo                      Same as: resume demo
baribari join <url>                Join LAN share (receive only)
baribari completion [shell]        bash | zsh | fish | powershell
baribari -h | -V                   Help / version
```

### Common options

| Flag | Description |
|------|-------------|
| `--lang <lang>` | ASR: `auto` \| `zh` \| `en` \| `ja` \| `ko` \| `yue` |
| `--ui-lang <lang>` | UI: `zh` \| `ja` \| `en` |
| `--source <src>` | `mic` \| `loopback` \| `both` (Windows) |
| `--device <id>` | Mic index from `baribari devices` or device name |
| `-o, --output <file>` | Append transcript text to a file |
| `--no-spk` | Disable speaker identification |
| `--spk-threshold <n>` | Speaker match threshold `0–1` (default ~0.55) |
| `--no-tui` | Plain-text mode |
| `--record <path>` | Start WAV recording on launch |
| `--record-dir <dir>` | Default recording directory |
| `--ai` / `--no-ai` | Toggle AI enhancement |
| `--ai-correct` / `--no-ai-correct` | Toggle AI typo correction (independent of translate) |
| `--ai-translate <lang>` | Translation target (empty = off) |
| `--ai-base-url <url>` | OpenAI-compatible base URL |
| `--ai-model <id>` | Model id |
| `--ai-key <key>` | API key (prefer env `BARIBARI_AI_KEY`) |
| `--share` / `--share-port <n>` | LAN share host |
| `--join <url>` | Join share (also: `baribari join <url>`) |
| `--vad-threshold <n>` | Silero speech probability threshold |
| `--vad-min-silence <sec>` | Silence duration to split segments (lower = snappier) |
| `--vad-min-speech <sec>` | Drop bursts shorter than this |
| `--vad-max-speech <sec>` | Force-cut long monologues |
| `--demo` | Same as `baribari resume demo` (built-in sample session) |

### Setup

```bash
baribari setup                     # Status + guide
baribari setup --download          # Download missing models
baribari setup --download -y       # Non-interactive
baribari setup --skip-spk          # Without speaker model
baribari setup --models-dir D:/m   # Custom models root
```

### Shell completion

```bash
# bash
eval "$(baribari completion bash)"

# zsh
eval "$(baribari completion zsh)"

# fish
baribari completion fish > ~/.config/fish/completions/baribari.fish

# PowerShell
baribari completion powershell | Out-String | Invoke-Expression
```

### Examples

```bash
baribari --lang ja --ui-lang en
baribari --source both -o meeting.txt
baribari --ai --ai-base-url https://api.openai.com/v1 --ai-translate en
baribari --share                   # default port 8787
baribari --share --share-port 8788
baribari join http://192.168.1.10:8787/
baribari --vad-min-silence 0.35 --spk-threshold 0.60
baribari resume demo
baribari session list
baribari resume ses_xxxx
```

---

## Global speakers (fixed attendees)

Voiceprints + display names are stored in:

```text
~/.config/baribari/speakers/roster.json
```

- On each live session, the roster is **loaded first** as speaker slots `1…G`.
- Matching uses the same CAM++ embeddings / cosine threshold as session ID.
- In the TUI, open the speaker list (`Tab`) → **rename** an auto-detected speaker (`Enter`) → that person is **saved to the global roster** (name + current embedding).
- Later meetings auto-label them when the voice matches; centroids are EMA-updated and written back on exit.

Turn off speaker ID with `--no-spk` if you do not need this.

---

## Sessions

Every live meeting is saved automatically:

```text
~/.config/baribari/sessions/<session-id>/
  meta.json           # id, name, duration, counts
  transcript.jsonl    # segments (text + translation)
  speakers.json
  audio.wav           # only if you enable recording (r)
```

```bash
baribari session list                 # or: baribari sessions
baribari session rm ses_full_exact_id # type full id again to confirm
baribari session rm ses_xxx -y        # skip confirm
baribari session rm ses_ab --allow-prefix  # unique prefix only
baribari session path ses_m5abc
baribari resume demo                  # built-in sample meeting
baribari resume ses_m5abc             # replay a real session
```

Delete requires the **full session id** by default (type it again to confirm). Use `--allow-prefix` only when the prefix is unique; `-y` skips the prompt.

### Resume mode

Not a live meeting: browse captions on a **timeline**, optionally play audio, continue capture, run AI tools, or share — keys differ from the live TUI.

| Key | Action |
|-----|--------|
| `↑` `↓` | Previous / next **segment** (moves playhead to that segment) |
| `←` `→` | Seek **−2s / +2s** on the timeline |
| `Space` or `p` | Play / pause (prefers `ffplay`; else bundled `ffmpeg` + OS player; else cursor only) |
| `c` | **Continue** live capture into this session (not demo) |
| `t` / `T` | Translate **current** / **all missing** (AI) |
| `m` | Meeting **summary** (transcript focus) |
| `m` | **Merge** speakers (speaker panel only): all `○` · `Space` → · `Esc` → `y`/`n` save |
| `s` | Settings — inside settings: `↑↓` move, `←→` change, `Esc`/`s` close |
| `e` | Rename session |
| `h` | Toggle **LAN share** (does not quit) |
| `q` | Quit |

Footer shows the same bindings on one line. Live meeting keys (`r` record, `Tab` speakers, `1–9` assign) are **not** used in resume.

Audio: `audio-part-*.wav` + `audio.wav` are **merged** when formats match, or chained on one timeline. Continue + record **appends** PCM into `audio.wav` when possible.

---

## TUI keys

| Key | Action |
|-----|--------|
| `p` / `Space` | Pause / resume listening |
| `s` | Settings (scrollable groups) |
| `h` | Toggle LAN share |
| `r` | Toggle recording → session `audio.wav` when in a live session |
| `c` | Clear on-screen transcript (does not delete the session files) |
| `Tab` | Focus speakers ↔ transcript |
| `1`–`9` | Assign last segment to speaker *N* (speaker-list focus) |
| `m` | **Merge** speakers (in speaker list: source → pick target → Enter) |
| `↑` `↓` / mouse wheel | Scroll transcript (wheel up = older; `g` = jump to live bottom) |
| `q` | Quit |

**Layout:** speakers · live transcript · device / record / share  
**Live vs final:** the transcript column keeps a single **refreshable live row** at the bottom while SenseVoice is decoding the current VAD segment (status like “Recognizing…”; no invented tokens). When the segment endpoints, that row clears and a **final** line is appended to history. Session files, LAN share, and AI correct/translate use **finals only**.  
**Settings:** recognition, AI (incl. translate target), audio, share, VAD, UI language  
**Resume settings:** UI language (instant), AI translate target, model (middle-ellipsis for long ids), API status  

---

## Configuration

Default directory (override with `BARIBARI_CONFIG_DIR`):

```text
~/.config/baribari/
├── config.json      # persisted settings
├── replace.json     # local non-AI dictionary + cleanup (auto-created)
├── models/          # VAD / ASR / speaker models
├── sessions/        # auto-saved meetings (transcript ± audio)
├── speakers/        # global voiceprint roster
└── recordings/      # legacy / fallback WAV dir
```

CLI flags always override `config.json`. UI language is stored as `uiLang` and chosen on first run if missing.

**First-run UI language picker** lists `1) 中文` · `2) 日本語` · `3) English (default)`. Enter / empty keeps **English** (item 3). Numbers always match the on-screen list.

### VAD presets (Settings)

In the TUI: **Settings → VAD preset** (`←` / `→`). Picking a preset writes the numeric VAD fields (you can still fine-tune afterward → shows as *custom*).

| Preset | min silence | max speech | Intent |
|--------|-------------|------------|--------|
| **Balanced** (default) | 0.6s | 30s | Fewer cuts, longer phrases |
| **Meeting** | 0.32s | 9s | Multi-speaker turn-taking (recommended) |
| **Low latency** | 0.22s / 0.28s | 8s / 12s | Faster finals; tuned for SenseVoice / Fun-ASR-Nano |
| **Smooth** | 0.4s | 12s | Fewer fragments |
| **Aggressive** | 0.25s | 6s | Short cuts; lean on same-speaker merge |

CLI still accepts `--vad-min-silence` / `--vad-max-speech` / etc. for one-off overrides.

### Same-speaker turn merge

Short VAD finals from the **same speaker** can coalesce into one “turn” before AI correct/translate (so you don’t pay one LLM call per micro-chunk). Config key `speakerTurn` in `config.json` (also editable in Settings when exposed):

| Field | Default | Meaning |
|-------|---------|---------|
| `enabled` | `true` | Master switch |
| `maxGapSec` | `1.4` | Max gap between chunks still merged |
| `maxTurnSec` | `24` | Force-commit open turn |
| `idleMs` | `4000` | Quiet time after last chunk before commit + AI |
| `maxChunks` | `3` | Max micro-segments per turn |

### Local polish (no AI)

After ASR (and same-speaker turn merge), text is cleaned and passed through `replace.json` **before** optional AI correct/translate:

```json
{
  "enabled": true,
  "replacements": [
    { "from": "日言語", "to": "日本語" },
    { "from": "ズーム", "to": "Zoom" }
  ]
}
```

Or a flat map: `{ "日言語": "日本語", "ズーム": "Zoom" }`. Longest match first. Built-in cleanup collapses repeated `、。`, NFKC, CJK spacing. Edit the file anytime — reloaded by mtime (no restart required for new rules on next segment).

### Environment

| Variable | Purpose |
|----------|---------|
| `BARIBARI_CONFIG_DIR` | Config / models / recordings root |
| `BARIBARI_UI_LANG` | `zh` \| `ja` \| `en` |
| `BARIBARI_AI_KEY` | Preferred API key |
| `OPENAI_API_KEY` | Fallback API key |
| `BARIBARI_NO_UPDATE_CHECK` | Set to `1` to disable the startup npm version check |

The version check runs once in the background at startup and silently ignores network errors.

---

## Models

SenseVoice is the default. Open **Settings → Speech ASR → ASR model** and use
`←` / `→` to switch to Fun-ASR-Nano. If its files are not installed, baribari
asks before downloading them (about 1 GB extracted) and switches only after the
download succeeds. You can also start directly with
`baribari --asr-engine funasr-nano`.

| Component | Role | Auto-download |
|-----------|------|----------------|
| **Silero VAD** | Speech segmentation | `baribari setup --download` |
| **SenseVoice** | Multilingual ASR | same |
| **Fun-ASR-Nano** | Optional local ASR for Chinese, English, and Japanese | downloaded when selected |
| **3D-Speaker CAM++** | Speaker embeddings | same (`--skip-spk` to omit) |

Manual URLs and layout: see [Models (detail)](#models-detail) or run `baribari paths`.

Custom paths in `config.json`:

```json
{
  "modelsDir": "/path/to/models",
  "models": {
    "vad": "/path/to/silero_vad.onnx",
    "senseVoiceDir": "/path/to/sense-voice-dir",
    "spk": "/path/to/3dspeaker.onnx"
  }
}
```

<a id="models-detail"></a>

<details>
<summary><strong>Manual download links</strong></summary>

| File | URL |
|------|-----|
| `silero_vad.onnx` | [download](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx) |
| SenseVoice int8 archive | [download](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2) |
| Speaker embedding | [download](https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx) |

Release pages: [asr-models](https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models) · [speaker models](https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models)

</details>

---

## AI enhancement

Optional post-process via any **OpenAI-compatible** Chat Completions API (OpenAI, many gateways, Foundry `/openai/v1` with Bearer key, etc.).

```bash
export BARIBARI_AI_KEY=sk-...
baribari --ai --ai-translate en --ai-model gpt-4o-mini
```

In the TUI: **Settings → AI** — toggle, **translate target**, **Provider** (`←→` presets), BASE_URL, API key (masked), model.

Presets (OpenAI-compatible `chat/completions` — **no extra SDK**):

| Provider | BASE_URL | Example model |
|----------|----------|----------------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `google/gemini-2.0-flash-001` |
| Ollama (local) | `http://127.0.0.1:11434/v1` | `qwen2.5:7b` |
| Custom | edit BASE_URL manually | — |

Gemini: use an **AI Studio API key** as `API Key` / `BARIBARI_AI_KEY` (same as OpenAI-style `Authorization: Bearer`).

```bash
baribari --ai --ai-translate en \
  --ai-base-url https://generativelanguage.googleapis.com/v1beta/openai \
  --ai-model gemini-2.0-flash \
  --ai-key "$GEMINI_API_KEY"
```

- **corrected** stays in the source language  
- **translation** is a separate line (never replaces the original)

---

## LAN share

```bash
# Host
baribari --share

# Peer (browser or CLI)
baribari join http://<lan-ip>:8787/
```

The host side panel shows a clickable LAN URL (`host:port`). Peers receive live segments without running ASR.

---

## How transcription timing works

Subtitles appear **after VAD ends a speech segment** (not word-by-word streaming). While a segment is decoding, the TUI may show a **live** status row; only **finals** are saved/shared.

| Setting | Default | Effect |
|---------|---------|--------|
| Silence split (`--vad-min-silence`) | **0.6s** (Balanced) | Quiet this long → cut & recognize |
| Max speech (`--vad-max-speech`) | **30s** | Force-cut long monologues |
| Min speech (`--vad-min-speech`) | **0.4s** | Drop short noise bursts |
| Speaker threshold (default) | **~0.55** | Higher → fewer speaker splits |

For snappier meetings use preset **Meeting** or e.g. `--vad-min-silence 0.32 --vad-max-speech 9`.

Deep dives: [docs/architecture.md](./docs/architecture.md) · [docs/asr-pipeline.md](./docs/asr-pipeline.md) · [docs/speakers.md](./docs/speakers.md).

---

## Documentation site

Design docs live in [`docs/`](./docs/) and can be published with **GitHub Pages** (VitePress):

```bash
npm run docs:dev      # local preview
npm run docs:build    # → docs/.vitepress/dist
```

After the first push of `.github/workflows/docs.yml`, enable **Settings → Pages → Source: GitHub Actions**. Site URL (project pages):

`https://qinyangwang.github.io/baribari/`

---

## Development

```bash
git clone https://github.com/QinYangWang/baribari.git
cd baribari
npm install          # Linux may need: npm install --force
npm run hooks:install   # pre-commit: typecheck + check:i18n
npm run typecheck
npm run check:i18n      # locale key parity (zh/ja/en)
npm run precommit       # same gate as git pre-commit
npm run docs:dev        # design docs (VitePress)
npm run dev -- --demo
npm run dev -- doctor
npm run build
```

```text
src/
  index.ts           CLI (commander subcommands)
  tui.ts             Fullscreen ANSI TUI
  resume-tui.ts      Session browser / continue
  transcribe.ts      VAD + ASR loop
  speaker-tracker.ts Speaker embeddings (+ global seed)
  speaker-library.ts Global roster (roster.json)
  speaker-turn.ts    Same-speaker turn coalesce
  postprocess.ts     Local dict / cleanup (replace.json)
  audio-capture.ts   Mic / loopback
  audio-play.ts      Resume playback helpers
  key-input.ts       Terminal key feeder (incl. CJK)
  ai.ts              Optional LLM pipeline
  share-*.ts         LAN host / join
  session.ts         Session files + path safety
  setup.ts           First-run + downloads
  i18n/              zh · ja · en
  settings.ts        config.json
docs/                Design docs (VitePress → GitHub Pages)
```

### Publish

Tags matching `package.json` version trigger GitHub Actions → npm (Trusted Publishing):

```bash
# bump version in package.json
git tag v1.5.0
git push origin v1.5.0
```

---

## License

[MIT](./LICENSE) © baribari contributors

---

<div align="center">

**[npm](https://www.npmjs.com/package/baribari)** · **[Issues](https://github.com/QinYangWang/baribari/issues)** · **[Releases](https://github.com/QinYangWang/baribari/releases)**

</div>
