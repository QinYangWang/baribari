# Live transcription

Start a live meeting from any directory:

```bash
baribari
```

baribari captures audio, runs local VAD + ASR, labels speakers, and auto-saves a session under `~/.config/baribari/sessions/`.

![Live transcription with speaker labels](/screenshots/live-transcription.png)

## Live TUI keys

| Key | Action |
|-----|--------|
| `p` / `Space` | Pause / resume listening |
| `s` | Settings (scrollable groups) |
| `h` | Toggle LAN share |
| `r` | Toggle recording → session `audio.wav` |
| `c` | Clear on-screen transcript (does not delete session files) |
| `Tab` | Focus speakers ↔ transcript |
| `1`–`9` | Assign last segment to speaker *N* (speaker-list focus) |
| `m` | **Merge** speakers (in speaker list: source → pick target → Enter) |
| `↑` `↓` / mouse wheel | Scroll transcript (`g` = jump to live bottom) |
| `q` | Quit |

**Layout:** speakers · live transcript · device / record / share

## Live vs final

The transcript column keeps a single **refreshable live row** at the bottom while ASR is decoding the current VAD segment (status like “Recognizing…”; no invented tokens). When the segment ends, that row clears and a **final** line is appended.

Session files, LAN share, and AI correct/translate use **finals only**.

## Timing

Subtitles appear **after VAD ends a speech segment**, not word-by-word.

| Setting | Default | Effect |
|---------|---------|--------|
| Silence split (`--vad-min-silence`) | **0.6s** (Balanced) | Quiet this long → cut & recognize |
| Max speech (`--vad-max-speech`) | **30s** | Force-cut long monologues |
| Min speech (`--vad-min-speech`) | **0.4s** | Drop short noise bursts |

For snappier multi-speaker meetings, use VAD preset **Meeting** in Settings, or e.g. `--vad-min-silence 0.32 --vad-max-speech 9`.

## Settings groups

In the live TUI, open **Settings** (`s`) for:

- Recognition (language, ASR model)
- AI (toggle, translate target, provider, key, model)
- Audio (source, device)
- Share
- VAD presets and fine-tune
- UI language

See [Configuration](./configuration) and [Models & AI](./models-ai).

## Common launch options

```bash
baribari --lang ja --ui-lang en
baribari --source both -o meeting.txt
baribari --no-spk
baribari --record ./meeting.wav
baribari --ai --ai-translate en
baribari --share --share-port 8788
```

Full list: [CLI reference](./cli).
