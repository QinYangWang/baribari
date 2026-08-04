# Speakers

## Two related problems

| Problem | Mechanism |
|---------|-----------|
| **Who** spoke this chunk? | Speaker **identification** (embedding match) |
| **When** did speakers change? | VAD silence cuts + (future) diarization / change-point |

baribari currently assigns one speaker ID to each VAD segment. It does not yet perform full speaker diarization within a segment.

## Identification path

1. **3D-Speaker CAM++** embedding extractor (`sherpa-onnx-node`).
2. **Centroids** with cosine similarity + EMA updates (`speaker-tracker.ts`).
3. **Multi-window voting** on longer chunks (onset/offset/energy peaks) to reduce barge-in pollution.
4. Threshold: `--spk-threshold` / settings (default ~**0.55**). Higher → fewer new speakers / fewer splits.

Disable entirely: `--no-spk` / setup `--skip-spk`.

## Global roster

Path: `~/.config/baribari/speakers/roster.json` (`speaker-library.ts`).

- Loaded at live start as fixed slots `1…G` before session-only speakers.
- Renaming an auto-detected speaker in the TUI (**Enter** on speaker list) **promotes** name + embedding to the roster.
- On exit, matched centroids can be EMA-updated and written back.
- Later meetings auto-label when voice matches.

Session-local `speakers.json` still records who appeared in that meeting.

## Merge UX

Live / resume speaker panel:

- **`m`** — multi-select merge (mark sources → target → confirm).
- **`1`–`9`** — assign last segment to speaker N (live, speaker focus).
- Resume merge mode: all `○`, Space → `→`, Esc → y/n save (see README keys).

## Hard limits (by design)

| Scenario | Behavior |
|----------|----------|
| Seamless A→B, no silence | Often **one** VAD segment → one label |
| Overlap / barge-in | One primary speaker via voting; may be wrong |
| Same person drift | May split into two IDs without roster |

Changing the SenseVoice model does not solve these cases because speech recognition and speaker assignment are separate tasks.

## Future (sherpa docs alignment)

| Approach | Fit |
|----------|-----|
| Enrollment (pre-register voices) | Stronger ID; extends roster UX |
| Embedding **change-point** split inside a VAD chunk | Better seamless handoff without full diar |
| Offline **pyannote segmentation + embedding + cluster** | Best for **post-hoc** re-label on `audio.wav` (resume) |
| Streaming diar every utterance | Usually too heavy / wrong shape for snappy live |

Official offline diarization is **faster than real-time** (RTF ~0.1–0.3 on samples) but still **batch-oriented** — good for session cleanup, not for “interrupt mid-sentence” live labeling.

Details and priorities: [roadmap](./roadmap.md).
