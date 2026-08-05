---
title: "Roadmap"
description: "Now, next, later, and lab priorities for baribari."
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["project", "roadmap"]
isPinned: true
growthStage: "seedling"
---
Turn live speech into understanding people can share, revisit, and build on — without giving up control of the audio.

This board communicates **priority**, not release dates. Cards move when reliability and measured quality support the next layer.

## Now

### Meetings that do not break

*Reliability* — Protect an active meeting from model, audio, and terminal failures.

- Stream recordings to disk and bound every queue
- Recover open sessions with atomic state writes
- Resume and verify interrupted model downloads
- Stress-test multi-hour capture and continuation

### A benchmark we can trust

*Quality* — Measure quality before tuning models or claiming improvements.

- Compare SenseVoice, Fun-ASR-Nano, and ReazonSpeech
- Cover fast Japanese, turn-taking, noise, and far-field audio
- Track error rate, final latency, memory, and CPU

## Next

### Understand speech sooner

*Captions* — Reduce the wait for a dependable caption without fragmenting every phrase.

- Tune model-aware VAD and final commits
- Add names and domain terms as hotwords
- Evaluate streaming drafts with offline finals
- Prototype online Zipformer partials

### Remember who is speaking

*Speakers* — Prefer an honest uncertain label over a confident wrong identity.

- Vote across multiple embedding windows
- Detect speaker changes inside long segments
- Add uncertain, mixed, split, and rematch flows
- Offer optional post-meeting diarization

## Later

### Meeting records people reuse

*Knowledge* — Move from a transcript file to a durable, searchable source of context.

- Search and jump to the matching moment
- Edit without losing source text or translation
- Export SRT, VTT, Markdown, and JSON
- Batch import and re-run selected segments

### One speech engine, many people

*Self-hosting* — Let one machine capture and infer while teams follow from a browser.

- Add baribari serve and a versioned event protocol
- Reconnect with cursors and message deduplication
- Add access tokens, API, webhooks, and a small admin UI
- Document Docker, systemd, and LAN deployment

## Lab

### Speak across languages

*Voice* — Explore translation that becomes audio while preserving user control.

- Translation → TTS → virtual microphone
- Measure latency, interruption, and echo control
- Keep voice cloning out of the near-term scope

### Practice speaking with feedback

*Learning* — Test whether local speech infrastructure can support useful coaching.

- Phoneme alignment and pronunciation feedback
- Stress, rhythm, pitch, and grammar coaching
- Optional always-on-top caption window

> **Current focus**
>
> Make multi-hour meetings continuous and recoverable, then improve Japanese captions and speaker identity on that stable foundation.


## Platform foundation

Every card depends on a stable engine layer: common interfaces for ASR, speaker models, translation, and TTS; one model catalog with verified downloads; a versioned transcript event API; and benchmarks in regression testing.

## Not planned soon



## Contributing

- Pick a bounded card and open an issue before a large implementation
- Include model license, source, benchmark data, and a reproducible sample
- Report the language, audio environment, model, and expected result with quality issues
- Donations support model hosting, CI, signing, and shared test hardware; features remain open

## Not planned soon

- Mobile clients
- Commercial SaaS and billing
- Cloud-only defaults
- A complete video-meeting system
- Near-term voice cloning
- Perfect overlap separation without a separation model
