# Roadmap

<div class="roadmap-hero">
  <span class="roadmap-eyebrow">LOCAL-FIRST · OPEN SOURCE</span>
  <p class="roadmap-lead">Build baribari into a dependable, self-hostable real-time speech tool for Chinese, Japanese, and English meetings.</p>
  <p>This roadmap communicates direction, not release dates. Stability and measurable recognition quality come before feature count.</p>
</div>

## At a glance

<div class="roadmap-grid">
  <article class="roadmap-card is-now">
    <span class="roadmap-status">Now</span>
    <h3>Long-meeting reliability</h3>
    <p>Bound memory, recover interrupted sessions, and keep model or audio failures from freezing the TUI.</p>
  </article>
  <article class="roadmap-card is-next">
    <span class="roadmap-status">Next</span>
    <h3>Captions and speakers</h3>
    <p>Reduce final-caption latency and improve speaker matching in fast Japanese and multi-speaker meetings.</p>
  </article>
  <article class="roadmap-card is-later">
    <span class="roadmap-status">Later</span>
    <h3>Sessions and Headless</h3>
    <p>Add search, editing, and exports, then let one machine serve transcripts to multiple people.</p>
  </article>
  <article class="roadmap-card is-explore">
    <span class="roadmap-status">Explore</span>
    <h3>Real-time voice apps</h3>
    <p>Experiment with translated speech, subtitle overlays, and speaking practice without blocking the core.</p>
  </article>
</div>

::: tip Current focus
Make multi-hour meetings continuous and recoverable before expanding into new clients and interaction modes.
:::

## 1. Finish long meetings reliably <Badge type="danger" text="Current" />

**Goal:** a model, audio-device, or terminal-output failure must not destroy an ongoing meeting.

- Stream WAV data to disk instead of retaining a long recording in memory
- Recover open sessions and write critical state atomically
- Bound audio, inference, and UI queues so the TUI remains responsive
- Resume, verify, and retry damaged Windows model downloads
- Test pause, continuation, audio merge, and playback-position recovery
- Clarify capture support on Linux and macOS

**Done when:** memory remains stable over multi-hour meetings and a component failure does not corrupt saved work.

## 2. Improve live-caption quality <Badge type="warning" text="Next" />

**Goal:** shorten the delay between finishing a phrase and seeing a dependable final caption.

- Benchmark SenseVoice, Fun-ASR-Nano, and ReazonSpeech through one harness
- Include fast Japanese, speaker turns, far-field audio, and noisy samples
- Track first-token latency, final-caption latency, error rate, and resource use
- Tune VAD endpoints and final-caption commits
- Add optional online Zipformer partial captions
- Evaluate a streaming-draft plus offline-final two-pass pipeline
- Add hotwords for names, terms, and product vocabulary

## 3. Improve speaker identification <Badge type="warning" text="Next" />

**Goal:** prefer an uncertain label over confidently assigning speech to the wrong person.

- Refine ERes2Net-large, CAM++, and global voice-roster selection
- Use multi-window embedding votes for longer turns
- Detect speaker change points inside long VAD segments
- Add `uncertain` / `mixed` states and candidate matches
- Improve rename, merge, split, and rematch workflows
- Offer optional post-meeting offline diarization

> Overlapping speech needs a dedicated separation model. The near-term goal is fewer false assignments, not perfect overlap separation.

## 4. Make meeting records useful <Badge type="info" text="Later" />

**Goal:** people can find, correct, and take away the result of a meeting.

- Export SRT, VTT, Markdown, and JSON
- Search full text and jump to the matching time
- Add session names, tags, and favorites
- Store the original, edited text, and translation separately
- Re-run recognition or translation for one or many segments
- Re-run speaker identification after a meeting
- Import existing audio and video in batches

## 5. Share through a Headless service <Badge type="info" text="Later" />

**Goal:** one machine captures and runs inference while other people watch the same meeting in a browser.

- Add a `baribari serve` mode
- Version the WebSocket transcript event protocol
- Support reconnect cursors and message deduplication
- Persist shared sessions to disk
- Add optional access tokens and read-only access
- Document Docker, systemd, and LAN deployment
- Provide a small web admin, API, and webhooks

This stage targets straightforward self-hosting, not billing or a commercial multi-tenant SaaS.

## 6. Open the model and engine layer <Badge type="info" text="Later" />

**Goal:** add a model without rewriting meeting, session, or UI logic.

- Unify ASR, translation, TTS, and speaker-model interfaces
- Unify model catalogs, downloads, verification, and versions
- Publish a community model-adapter template
- Expose a stable transcript event API
- Add performance and accuracy benchmarks to regression testing

## Lab

These ideas are useful, but they do not block the core roadmap:

| Direction | What to validate |
| --- | --- |
| Translation → TTS → audio output | Latency, interruption policy, and echo control |
| Virtual microphone | Windows/macOS installation and compatibility |
| Always-on-top captions | Whether Tauri or a native window is justified |
| AI speaking practice | Phoneme alignment, stress, rhythm, and pitch feedback |
| Privacy mode | No audio at rest, local-only AI, and verifiable data boundaries |

## Not planned soon

<div class="roadmap-not-doing">
  <span>Mobile clients</span>
  <span>Commercial SaaS and billing</span>
  <span>Cloud-only defaults</span>
  <span>A complete video-meeting system</span>
  <span>Near-term voice cloning</span>
  <span>Perfect overlap separation without a separation model</span>
</div>

## Contributing

- Start with issues labeled `good first issue` or `help wanted`
- Include the license, source URL, and benchmark results with a model contribution
- Include the language, audio environment, model, and a reproducible sample in quality reports
- Donate toward shared costs such as model hosting, CI, signing, and test hardware

Features will not be locked behind donations. Donations fund additional maintenance and testing capacity.
