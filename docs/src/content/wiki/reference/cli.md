---
title: "CLI reference"
description: "Every baribari command and flag."
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["reference", "cli"]
isPinned: true
growthStage: "evergreen"
---
```text
baribari [options]                 Start live transcription (default)
baribari setup [options]           Check / download models
baribari paths | config            Print config & model paths
baribari devices                   List microphones
baribari doctor                    Diagnose environment
baribari session list              List saved meetings
baribari session rm <id>           Delete a session
baribari session path <id>         Print session directory
baribari resume [id]               Browse/replay a session (default: demo)
baribari demo                      Same as: resume demo
baribari join <url>                Join LAN share (receive only)
baribari completion [shell]        bash | zsh | fish | powershell
baribari -h | -V                   Help / version
```

## Common options (live run)

| Flag | Description |
|------|-------------|
| `--lang <lang>` | ASR: `auto` \| `zh` \| `en` \| `ja` \| `ko` \| `yue` |
| `--asr-engine <engine>` | `sensevoice` \| `funasr-nano` \| `reazonspeech-ja` |
| `--ui-lang <lang>` | UI: `zh` \| `ja` \| `en` |
| `--source <src>` | `mic` \| `loopback` \| `both` (Windows) |
| `--device <id>` | Mic index from `baribari devices` or device name |
| `-o, --output <file>` | Append transcript text to a file |
| `--no-spk` | Disable speaker identification |
| `--spk-engine <engine>` | `campplus` \| `eres2net-large` |
| `--spk-threshold <n>` | Speaker match threshold `0–1` |
| `--no-tui` | Plain-text mode |
| `--record <path>` | Start WAV recording on launch |
| `--record-dir <dir>` | Default recording directory |
| `--ai` / `--no-ai` | Toggle AI enhancement |
| `--ai-correct` / `--no-ai-correct` | Toggle AI typo correction |
| `--ai-translate <lang>` | Translation target (empty = off) |
| `--ai-base-url <url>` | OpenAI-compatible base URL |
| `--ai-model <id>` | Model id |
| `--ai-key <key>` | API key (prefer env `BARIBARI_AI_KEY`) |
| `--share` / `--share-port <n>` | LAN share host |
| `--join <url>` | Join share (also: `baribari join <url>`) |
| `--vad-threshold <n>` | Silero speech probability threshold |
| `--vad-min-silence <sec>` | Silence duration to split segments |
| `--vad-min-speech <sec>` | Drop bursts shorter than this |
| `--vad-max-speech <sec>` | Force-cut long monologues |
| `--demo` | Same as `baribari resume demo` |

## Setup

```bash
baribari setup                     # Status + guide
baribari setup --download          # Download missing models
baribari setup --download -y       # Non-interactive
baribari setup --skip-spk          # Without speaker model
baribari setup --models-dir D:/m   # Custom models root
```

## Sessions

```bash
baribari session list
baribari session path ses_m5abc
baribari session rm ses_full_exact_id   # type full id again to confirm
baribari session rm ses_xxx -y          # skip confirm
baribari session rm ses_ab --allow-prefix
baribari resume demo
baribari resume ses_m5abc
```

Delete requires the **full session id** by default. Use `--allow-prefix` only when the prefix is unique.

## Examples

```bash
baribari --lang ja --ui-lang en
baribari --source both -o meeting.txt
baribari --ai --ai-base-url https://api.openai.com/v1 --ai-translate en
baribari --share --share-port 8788
baribari join http://192.168.1.10:8787/
baribari --vad-min-silence 0.35 --spk-threshold 0.60
baribari --asr-engine reazonspeech-ja
```
