# Roadmap notes

This roadmap lists current product and engineering priorities. It describes direction, not committed release dates or guaranteed features.

## P0 — Stability & long meetings

- Stream WAV to disk (avoid multi-hour RAM buffers).
- Crash recovery for open sessions.
- Improve and document audio capture on Linux and macOS while retaining clear guidance for Windows loopback capture.
- Tests around session paths, clip merge, resume seek.

## P1 — Meeting product

- Export SRT / VTT / Markdown / JSON.
- Speaker rename/merge polish + roster (partially shipped).
- **Partial UI + optional online zipformer** (true low-latency captions).
- Resume full-text search + jump to time.
- Friendlier session names / list UX (partially shipped).

## P1.5 — Speaker quality

- Embedding **change-point** split inside long VAD segments.
- `mixed` / uncertain labels + better manual fix.
- Optional **offline diarization** re-label on save/resume (pyannote seg + embedding; not live-critical path).

## P2 — Collaboration & engines

- LAN share auth / roles / reconnect.
- Headless / service mode.
- `--engine-cmd` external recognizer (TMSpeech-style stdout protocol).
- Pluggable ASR: SenseVoice \| zipformer-online \| Qwen3-ASR (quality tier).

## P3 — Differentiation

- Live dub: translate → TTS → user-selected output device / virtual cable (clone later).
- Overlay subtitle window.
- Privacy modes (no audio disk, local-only AI).

## Explicit non-goals (near term)

- Replacing default SenseVoice with cloud-only streaming.
- Shipping non-commercial-only models as default (e.g. some diar packs).
- Perfect overlap separation without a dedicated separation model.

## References

- sherpa-onnx SenseVoice / online transducers / speaker diarization & identification docs.
- TMSpeech: partial-line UX and external recognizer protocol (inspiration, not a port).
