---
title: "Quick start"
description: "First meeting, demo mode, and the day-to-day loop."
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["start", "guide"]
isPinned: true
growthStage: "evergreen"
---
If baribari is not installed yet, see [Install](/baribari/wiki/start/install).

## First run

```bash
baribari setup --download
baribari
```

On first launch, pick the **UI language**, **ASR model**, and **speaker model**. Then run `baribari` wherever the meeting audio is available.

## Explore without a live meeting

```bash
baribari demo     # built-in sample session
baribari doctor   # diagnose audio and model setup
```

`baribari demo` is the same as `baribari resume demo`.

## A few useful one-liners

```bash
baribari --lang ja --ui-lang en
baribari --source both -o meeting.txt          # Windows loopback+mic
baribari --ai --ai-translate en
baribari --share                               # LAN host on port 8787
baribari join http://192.168.1.10:8787/
baribari session list
baribari resume ses_xxxx
```

## In the live TUI

| Key | Action |
|-----|--------|
| `p` / `Space` | Pause / resume listening |
| `s` | Settings |
| `r` | Toggle recording into the session |
| `Tab` | Focus speakers ↔ transcript |
| `h` | Toggle LAN share |
| `q` | Quit |

Full key maps: [Live transcription](/baribari/wiki/use/live) and [Sessions & resume](/baribari/wiki/use/sessions).

## Where next

- [Live transcription](/baribari/wiki/use/live) — day-to-day capture
- [Speakers](/baribari/wiki/use/speakers) — roster and voiceprints
- [Configuration](/baribari/wiki/configure/configuration) — config file, VAD, env
- [CLI reference](/baribari/wiki/reference/cli) — every command and flag
