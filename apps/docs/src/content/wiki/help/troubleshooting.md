---
title: "Troubleshooting"
description: "Common install, audio, model, and share failures."
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["help"]
isPinned: false
growthStage: "evergreen"
---
## Quick checks

```bash
baribari doctor
baribari paths
baribari devices
baribari setup
```

`doctor` reports audio devices, model presence, and common environment issues.

## No captions appear

1. Confirm the mic (or loopback on Windows) is selected — `baribari devices`, then `--device`.
2. Speak past the VAD min-speech threshold (default ~0.4s). Very short bursts are dropped.
3. Try VAD preset **Meeting** or lower `--vad-min-silence` if cuts feel too late.
4. Check pause state (`p` / `Space`) — listening may be paused.

## Model download fails

- Re-run `baribari setup --download`.
- Check disk space and network access to GitHub releases (sherpa-onnx model URLs).
- Set a custom root: `baribari setup --models-dir /path/to/models`.
- Manual URLs: [Models & AI](/baribari/wiki/configure/models-ai).

## Wrong language / garbled text

- Set ASR language: `--lang zh|en|ja|ko|yue|auto`.
- For Japanese-heavy meetings, try `--asr-engine reazonspeech-ja`.
- Add local fixes in `replace.json` before enabling AI correction.

## Speakers keep splitting or merging wrong

- Raise or lower `--spk-threshold` (defaults differ per engine).
- Prefer ERes2Net-large for harder rooms: `--spk-engine eres2net-large`.
- Rename and merge in the TUI (`Tab`, `m`) so the global roster learns names.
- Disable with `--no-spk` if you only need plain captions.

## AI not running

- Confirm `--ai` or Settings → AI is on.
- Set `BARIBARI_AI_KEY` (or `OPENAI_API_KEY`).
- Verify BASE_URL ends at the OpenAI-compatible root (e.g. `…/v1`).
- Correct and translate are independent toggles.

## LAN share peers see nothing

- Host must enable share (`--share` or `h`).
- Peers need the host LAN IP and port (default 8787).
- Only **final** segments are streamed — wait for a completed utterance.
- Firewalls may block inbound connections on the share port.

## Resume cannot play audio

- Recording must have been enabled (`r`) during the live session.
- Prefer `ffplay` on PATH; otherwise baribari tries bundled `ffmpeg` + OS player.
- Multi-clip sessions merge or chain timelines when formats allow.

## Still stuck

- Open an issue: [github.com/QinYangWang/baribari/issues](https://github.com/QinYangWang/baribari/issues)
- Include `baribari -V`, OS, and the relevant `baribari doctor` output (redact keys).
