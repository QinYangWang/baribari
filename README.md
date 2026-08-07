<div align="center">

<img src="./apps/docs/public/brand/baribari-logo.png" alt="baribari" width="72">

# baribari

[Documentation](https://qinyangwang.github.io/baribari/) · [Install](https://qinyangwang.github.io/baribari/wiki/start/install/) · [Quick start](https://qinyangwang.github.io/baribari/wiki/start/quick-start/)

**English** · [中文](./README.zh.md) · [日本語](./README.ja.md)

[![npm](https://img.shields.io/npm/v/baribari.svg)](https://www.npmjs.com/package/baribari)
[![Node](https://img.shields.io/node/v/baribari.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

</div>

---

<img src="./apps/docs/public/screenshots/demo-mode.png" alt="Demo session with a timeline, speaker labels, original text, and translations" width="960">

**Turn every conversation into shared, lasting knowledge.**

Private speech intelligence for live understanding, speaker memory, durable sessions, and self-hosted collaboration.

- **Local by default** — SenseVoice, Fun-ASR-Nano, ReazonSpeech, and Silero VAD run on your machine.
- **Who said what** — speaker embeddings label each turn; a global roster remembers frequent attendees.
- **A session, not a text dump** — reopen a meeting to play, continue, correct, translate, summarize, or share.
- **AI when you ask** — correction, translation, and summaries use the OpenAI-compatible provider you configure.
- **One host, many viewers** — share finalized captions over the LAN in a browser or CLI.
- **A foundation, not a dead end** — the same local speech layer can grow into search, headless sharing, translated voice, and learning tools.

---

## Install

```bash
npm install -g baribari
```

Requires **Node.js 18+**. Windows supports mic and system-audio capture; Linux and macOS currently focus on microphone capture.

## Quick start

```bash
baribari setup --download
baribari
```

Pick UI language, ASR model, and speaker model during setup. Then run `baribari` wherever the meeting audio is available.

The default live TUI is the **legacy** renderer. Opt into the modular Rezi redesign with `baribari --tui-backend rezi` or `BARIBARI_TUI=rezi` (falls back to legacy if Rezi cannot start).

```bash
baribari demo     # built-in sample meeting
baribari doctor   # diagnose audio and models
```

## Documentation

Setup, shortcuts, models, configuration, and troubleshooting live in the **[documentation](https://qinyangwang.github.io/baribari/)**.

## Develop

```bash
git clone https://github.com/QinYangWang/baribari.git
cd baribari
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

Contributions welcome. Open an issue or PR on [GitHub](https://github.com/QinYangWang/baribari).

## License

[MIT](./LICENSE) © baribari contributors
