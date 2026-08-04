# Sessions & resume

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
baribari session list
baribari session path <id>
baribari session rm <full-id>
baribari resume [id]          # default demo sample
baribari demo                 # alias
```

## Resume mode

Resume mode opens a saved session instead of starting a new live meeting. Use it to browse the transcript on a timeline, play recorded audio, or run session tools.

![Demo session with a timeline, speaker labels, original text, and translations](/screenshots/demo-mode.png)

| Area | Behavior |
|------|----------|
| Keys | Own set (↑↓ segments, ←→ seek, Space/p play, c continue, t/T translate, m summary|merge, e rename, h share, q quit) |
| Audio | Prefer `ffplay`; else bundled `ffmpeg-static` + OS player; merge/chain multi-clip timeline |
| Continue | `c` starts live capture **into the same session** (not demo) |
| AI | Translate current/all missing; meeting summary |
| Share | Toggle host share without quitting |

Live-only keys (`r`, `Tab`, `1–9`) are **not** bound in resume.

## Multi-clip audio

- Compatible `audio-part-*.wav` + `audio.wav` → **merge** when formats match.
- Otherwise **chain** on one timeline for seek/play.
- Continue + record **appends** PCM into `audio.wav` when possible.

## Segment record (jsonl)

The JSONL file contains final segments only. Typical fields include `start`, `end`, and `text`, plus optional `translation`, `corrected`, `spk`, and timestamp fields. Partial status events are never written to disk.

## Demo session

Built-in synthetic meeting for `resume demo` / `--demo` without real files.
