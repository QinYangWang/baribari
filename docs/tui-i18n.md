# TUI & i18n

## Live layout

The live interface is organized into three areas:

1. **Speakers** — roster + session speakers, rename, merge, assign  
2. **Transcript** — final history + one **live** row at bottom  
3. **Side** — device, record, share URL (OSC-8 clickable when supported)

![Live transcription view with a speaker list and incoming Japanese transcript](/screenshots/live-transcription.png)

Open Settings with `s` to change the interface language, recognition, AI, audio, sharing, and VAD options without leaving the TUI.

![Settings panel for interface language, speech recognition, AI, and audio](/screenshots/settings.png)

## Live vs final

| Kind | UI | Persist | Share | AI |
|------|----|---------|-------|----|
| `partial` | Replaces live row | No | No (default) | No |
| `final` | Appends history; clears live | Yes | Yes | Yes |

With SenseVoice, a partial event is usually a **status** such as “Recognizing…”, not provisional transcript text. A future online engine can send real partial text through the same channel.

Under **Settings → Speech ASR → ASR model**, switch between SenseVoice and
Fun-ASR-Nano with `←` / `→`. When Fun-ASR-Nano is missing, the TUI asks before
downloading it and keeps the current model active until installation succeeds.

## Key cheatsheet (live)

See README for the full table. Highlights: `p`/`Space` pause, `s` settings, `h` share, `r` record, `c` clear screen, `Tab` focus, `1–9` assign, `m` merge, `e` rename session, wheel/`g` scroll, `q` quit.

Settings groups are scrollable; many values use `←` `→`. Notice toasts auto-dismiss (~3s).

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
- `npm run check:i18n` — key parity; strict mode available.
- Pre-commit hook runs typecheck + i18n check (`npm run hooks:install`).

When adding UI strings: update **all three** locales and `MessageTree` type.
