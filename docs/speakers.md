# Speakers

## Two related problems

| Problem | Mechanism |
|---------|-----------|
| **Who** spoke this chunk? | Speaker **identification** (embedding match) |
| **When** did speakers change? | VAD silence cuts + (future) diarization / change-point |

baribari currently assigns one speaker ID to each VAD segment. It does not yet perform full speaker diarization within a segment (overlap separation is out of scope for the live path).

## Embedding models

| Model | File | Default threshold | Notes |
|-------|------|-------------------|--------|
| **ERes2Net-large** (recommended) | `3dspeaker_speech_eres2net_large_sv_zh-cn_3dspeaker_16k.onnx` (~111 MB) | **0.45** | Stronger ID; new installs / setup default |
| **CAM++** | `3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx` (~27 MB) | **0.55** | Lighter; legacy default when `spkEngine` unset |

Select in **Settings → Speaker model** (←→), `config.json` `spkEngine`, or `--spk-engine campplus|eres2net-large`.

Missing model → same Y / B download UX as ASR. Setup offers both; `--skip-spk` / `--no-spk` skips entirely.

**Per-model defaults matter:** cosine score distributions differ. Do not assume 0.55 fits every extractor.

## Identification path

1. Selected **3D-Speaker** ONNX via `sherpa-onnx-node` `SpeakerEmbeddingExtractor`.
2. **Bounded template bank** (≈3–5 vectors) per speaker — not a single drifting centroid (`speaker-tracker.ts`).
3. **Multi-window voting** on longer chunks (onset/offset/energy peaks).
4. **Enrollment guards:** short/quiet audio never opens a new ID; weak mismatches need repeated agreement before enroll.
5. **Global slots** update only on strong confidence (stricter than session speakers).
6. **Hysteresis** only in the ambiguous score band so real speaker changes still switch.

Disable entirely: `--no-spk` / setup `--skip-spk`.

## Global roster (model-aware)

Path: `~/.config/baribari/speakers/roster.json` (`speaker-library.ts`).

- Version **2**: each entry has `model` (`campplus` | `eres2net-large`) plus `embedding` / `embeddings[]`.
- Legacy v1 files (no `model`) migrate safely to **CAM++** — data is not deleted.
- At live start, only entries for the **active** model (and matching dim) are seeded as slots `1…G`.
- Other-model templates stay on disk for when you switch back.
- Rename in the TUI (**Enter** on speaker list) promotes name + template bank for the **current** model.
- On exit, strong global updates write back for that model only.

Session-local `speakers.json` still records who appeared in that meeting (labels only).

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
| Same person drift | Template bank + roster reduce splits; not perfect |
| Switch embedding model mid-history | Old roster rows ignored until you re-enroll under the new model |

Changing the ASR model does not solve these cases — speech recognition and speaker assignment are separate.

## Future (sherpa docs alignment)

| Approach | Fit |
|----------|-----|
| Enrollment (pre-register voices) | Stronger ID; extends roster UX |
| Embedding **change-point** split inside a VAD chunk | Better seamless handoff without full diar |
| Offline **pyannote segmentation + embedding + cluster** | Best for **post-hoc** re-label on `audio.wav` (resume) |
| Streaming diar every utterance | Usually too heavy / wrong shape for snappy live |

Official offline diarization is batch-oriented, so it fits session cleanup better than mid-sentence live labeling.

Details and priorities: [roadmap](./roadmap.md).
