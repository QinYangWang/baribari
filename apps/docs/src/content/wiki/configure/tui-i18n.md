---
title: "TUI & i18n"
description: "TUI layout, UI language, and ASR language separation."
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["configure", "tui", "i18n"]
isPinned: false
growthStage: "evergreen"
---
## TUI backends

baribari ships two live TUI implementations:

| Backend | How to enable | Notes |
|---------|---------------|--------|
| **legacy** (default) | `baribari` or `--tui-backend legacy` | Original custom renderer; full feature parity today |
| **rezi** (opt-in) | `baribari --tui-backend rezi` or `BARIBARI_TUI=rezi` | Modular Rezi redesign; falls back to legacy if startup fails |

CLI wins over `BARIBARI_TUI`. Rezi remains opt-in until it matches legacy for speaker merge, full settings edge-cases, and resume TUI.

Rezi live layout (approved redesign):

1. **Header** — `◇ baribari` brand, editable meeting name (left); listening status + elapsed (right)
2. **Wide** — speakers | transcript | inspector
3. **Medium / narrow** — transcript first; speakers/inspector as panels
4. **Actions** — focusable pause / settings / share / record / clear / quit

## Live layout (legacy)

The legacy live interface is organized into three areas:

1. **Speakers** — roster + session speakers, rename, merge, assign  
2. **Transcript** — final history + one **live** row at bottom  
3. **Side** — device, record, share URL (OSC-8 clickable when supported)

![Live transcription view with a speaker list and incoming Japanese transcript](/baribari/screenshots/live-transcription.png)

Open Settings with `s` to change the interface language, recognition, AI, audio, sharing, and VAD options without leaving the TUI.

![Settings panel for interface language, speech recognition, AI, and audio](/baribari/screenshots/settings.png)

## Live vs final

| Kind | UI | Persist | Share | AI |
|------|----|---------|-------|----|
| `partial` | Replaces live row | No | No (default) | No |
| `final` | Appends history; clears live | Yes | Yes | Yes |

With SenseVoice, a partial event is usually a **status** such as “Recognizing…”, not provisional transcript text. A future online engine can send real partial text through the same channel.

Under **Settings → Speech ASR → ASR model**, use `←` / `→` to cycle through
SenseVoice, Fun-ASR-Nano, and Japanese-optimized ReazonSpeech. When a model is
missing, the TUI asks before downloading it. Choose a foreground download or continue transcribing while it
downloads in the background. Wide layouts show its stage and progress in the
right details panel, which also summarizes the active VAD endpoint settings.
The current model stays active until installation succeeds.

## Key cheatsheet (live)

See README for the full table. Highlights: `p`/`Space` pause, `s` settings, `h` share, `r` record, `c` clear screen, `Tab` focus, `1–9` assign, `m` merge, `e` rename session, wheel/`g` scroll, `q` quit.

Settings groups are scrollable; many values use `←` `→`. Ordinary notice toasts auto-dismiss (~3s); download progress remains visible until it completes or fails.

Running `baribari setup` interactively also asks which recognition models to
install: SenseVoice (recommended), Fun-ASR-Nano, ReazonSpeech, or all three. `--yes` keeps the
configured model and skips this prompt for unattended setup.

## UI language vs ASR language

| | |
|--|--|
| **uiLang** | `zh` \| `ja` \| `en` — TUI/CLI strings |
| **lang** | ASR `auto` \| `zh` \| `en` \| `ja` \| `ko` \| `yue` |

These settings are independent. If `uiLang` has not been configured, the first run shows:

```text
1) 中文
2) 日本語
3) English (default)
```

Empty input → **English** (index 3). Digit N → `UI_LANGS[N-1]` (`zh`, `ja`, `en`). Override anytime: `--ui-lang`, env `BARIBARI_UI_LANG`, or Settings.

## i18n engineering

- Trees: `src/i18n/locales/{zh,ja,en}.ts` + `types.ts` key structural type.
- `pnpm check:i18n` — key parity; strict mode available.
- Pre-commit hook runs typecheck + i18n check (`pnpm hooks:install`).

When adding UI strings: update **all three** locales and `MessageTree` type.
