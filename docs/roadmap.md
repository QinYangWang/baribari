---
title: Roadmap
description: What baribari is building now, next, later, and in the lab
aside: false
---

# Roadmap

<div class="roadmap-hero">
  <span class="roadmap-eyebrow">LOCAL-FIRST · OPEN SOURCE · SELF-HOSTABLE</span>
  <p class="roadmap-lead">Turn live speech into understanding people can share, revisit, and build on — without giving up control of the audio.</p>
  <p>This board communicates priority, not release dates. Cards move when reliability and measured quality support the next layer.</p>
</div>

::: tip Current focus
Make multi-hour meetings continuous and recoverable, then improve Japanese captions and speaker identity on that stable foundation.
:::

<div class="roadmap-board">
  <section class="roadmap-column is-now">
    <header class="roadmap-column-header"><span class="roadmap-column-title">Now</span><span class="roadmap-count">2</span></header>
    <article class="roadmap-task">
      <span class="roadmap-label">Reliability</span>
      <h3>Meetings that do not break</h3>
      <p>Protect an active meeting from model, audio, and terminal failures.</p>
      <ul>
        <li>Stream recordings to disk and bound every queue</li>
        <li>Recover open sessions with atomic state writes</li>
        <li>Resume and verify interrupted model downloads</li>
        <li>Stress-test multi-hour capture and continuation</li>
      </ul>
    </article>
    <article class="roadmap-task">
      <span class="roadmap-label">Quality</span>
      <h3>A benchmark we can trust</h3>
      <p>Measure quality before tuning models or claiming improvements.</p>
      <ul>
        <li>Compare SenseVoice, Fun-ASR-Nano, and ReazonSpeech</li>
        <li>Cover fast Japanese, turn-taking, noise, and far-field audio</li>
        <li>Track error rate, final latency, memory, and CPU</li>
      </ul>
    </article>
  </section>

  <section class="roadmap-column is-next">
    <header class="roadmap-column-header"><span class="roadmap-column-title">Next</span><span class="roadmap-count">2</span></header>
    <article class="roadmap-task">
      <span class="roadmap-label">Captions</span>
      <h3>Understand speech sooner</h3>
      <p>Reduce the wait for a dependable caption without fragmenting every phrase.</p>
      <ul>
        <li>Tune model-aware VAD and final commits</li>
        <li>Add names and domain terms as hotwords</li>
        <li>Evaluate streaming drafts with offline finals</li>
        <li>Prototype online Zipformer partials</li>
      </ul>
    </article>
    <article class="roadmap-task">
      <span class="roadmap-label">Speakers</span>
      <h3>Remember who is speaking</h3>
      <p>Prefer an honest uncertain label over a confident wrong identity.</p>
      <ul>
        <li>Vote across multiple embedding windows</li>
        <li>Detect speaker changes inside long segments</li>
        <li>Add uncertain, mixed, split, and rematch flows</li>
        <li>Offer optional post-meeting diarization</li>
      </ul>
    </article>
  </section>

  <section class="roadmap-column is-later">
    <header class="roadmap-column-header"><span class="roadmap-column-title">Later</span><span class="roadmap-count">2</span></header>
    <article class="roadmap-task">
      <span class="roadmap-label">Knowledge</span>
      <h3>Meeting records people reuse</h3>
      <p>Move from a transcript file to a durable, searchable source of context.</p>
      <ul>
        <li>Search and jump to the matching moment</li>
        <li>Edit without losing source text or translation</li>
        <li>Export SRT, VTT, Markdown, and JSON</li>
        <li>Batch import and re-run selected segments</li>
      </ul>
    </article>
    <article class="roadmap-task">
      <span class="roadmap-label">Self-hosting</span>
      <h3>One speech engine, many people</h3>
      <p>Let one machine capture and infer while teams follow from a browser.</p>
      <ul>
        <li>Add <code>baribari serve</code> and a versioned event protocol</li>
        <li>Reconnect with cursors and message deduplication</li>
        <li>Add access tokens, API, webhooks, and a small admin UI</li>
        <li>Document Docker, systemd, and LAN deployment</li>
      </ul>
    </article>
  </section>

  <section class="roadmap-column is-lab">
    <header class="roadmap-column-header"><span class="roadmap-column-title">Lab</span><span class="roadmap-count">2</span></header>
    <article class="roadmap-task">
      <span class="roadmap-label">Voice</span>
      <h3>Speak across languages</h3>
      <p>Explore translation that becomes audio while preserving user control.</p>
      <ul>
        <li>Translation → TTS → virtual microphone</li>
        <li>Measure latency, interruption, and echo control</li>
        <li>Keep voice cloning out of the near-term scope</li>
      </ul>
    </article>
    <article class="roadmap-task">
      <span class="roadmap-label">Learning</span>
      <h3>Practice speaking with feedback</h3>
      <p>Test whether local speech infrastructure can support useful coaching.</p>
      <ul>
        <li>Phoneme alignment and pronunciation feedback</li>
        <li>Stress, rhythm, pitch, and grammar coaching</li>
        <li>Optional always-on-top caption window</li>
      </ul>
    </article>
  </section>
</div>

## Platform foundation

Every card depends on a stable engine layer: common interfaces for ASR, speaker models, translation, and TTS; one model catalog with verified downloads; a versioned transcript event API; and benchmarks in regression testing.

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

- Pick a bounded card and open an issue before a large implementation
- Include model license, source, benchmark data, and a reproducible sample
- Report the language, audio environment, model, and expected result with quality issues
- Donations support model hosting, CI, signing, and shared test hardware; features remain open
