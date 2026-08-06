---
title: "Sessions & resume"
description: "Saved sessions, resume, continue recording, and cleanup."
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["use", "sessions"]
isPinned: false
growthStage: "evergreen"
---
## Auto-save

Every live meeting creates:

```text
~/.config/baribari/sessions/<session-id>/
  meta.json            # id, name, times, counts, lang, …
  transcript.jsonl     # one Segment JSON per line (finals)
  speakers.json
  audio.wav            # if recording enabled (r) / continue+record
  audio-part-*.wav     # additional clips when formats differ
```

Session IDs use the form `ses_…`. The display name is separate from the ID and can be changed by pressing `e` in the TUI.

## Safety

- **Delete** (`session rm`): requires **full id** + typed confirm by default.
- `-y` skips confirm; `--allow-prefix` only if prefix uniquely matches.
- Path handling hardened against traversal (`session.ts`).

## CLI

```bash
baribari session list                 # or: baribari sessions
baribari session path <id>
baribari session rm <full-id>
baribari session rm ses_xxx -y
baribari session rm ses_ab --allow-prefix
baribari resume [id]                  # default demo sample
baribari demo                         # alias
```

## Resume mode

Resume mode opens a saved session instead of starting a new live meeting. Use it to browse the transcript on a timeline, play recorded audio, continue capture, run AI tools, or share.

![Demo session with a timeline, speaker labels, original text, and translations](/baribari/screenshots/demo-mode.png)

| Key | Action |
|-----|--------|
| `↑` `↓` | Previous / next **segment** (moves playhead) |
| `←` `→` | Seek **−2s / +2s** on the timeline |
| `Space` or `p` | Play / pause (prefers `ffplay`; else bundled `ffmpeg` + OS player) |
| `c` | **Continue** live capture into this session (not demo) |
| `t` / `T` | Translate **current** / **all missing** (AI) |
| `m` | Meeting **summary** (transcript focus) |
| `m` | **Merge** speakers (speaker panel only) |
| `s` | Settings |
| `e` | Rename session |
| `h` | Toggle **LAN share** (does not quit) |
| `q` | Quit |

Live-only keys (`r` record, `Tab` speakers, `1–9` assign) are **not** used in resume.

## Multi-clip audio

- Compatible `audio-part-*.wav` + `audio.wav` → **merge** when formats match.
- Otherwise **chain** on one timeline for seek/play.
- Continue + record **appends** PCM into `audio.wav` when possible.

## Segment record (jsonl)

The JSONL file contains final segments only. Typical fields include `start`, `end`, and `text`, plus optional `translation`, `corrected`, `spk`, and timestamp fields. Partial status events are never written to disk.

## Demo session

Built-in synthetic meeting for `resume demo` / `--demo` without real files.
