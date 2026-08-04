---
layout: home
title: baribari
titleTemplate: meeting transcription in your terminal

hero:
  name: baribari
  text: Stay in the meeting. Keep the notes.
  tagline: Transcribe meetings in your terminal with on-device recognition, speaker labels, and optional AI. Reopen any session later to review, continue recording, translate, or summarize it.
  actions:
    - theme: brand
      text: Get started
      link: https://github.com/QinYangWang/baribari#quick-start
    - theme: alt
      text: How it works
      link: /architecture
    - theme: alt
      text: View on npm
      link: https://www.npmjs.com/package/baribari

features:
  - title: Follow live captions
    details: Text appears while the meeting is in progress. If you miss something, scroll back through the transcript instead of relying on memory or incomplete notes.
    link: /sessions
    linkText: Open sessions guide
  - title: Keep recognition local
    details: SenseVoice and Silero VAD run on your machine, so speech recognition does not require uploading audio. A cloud service is used only when you enable and configure optional AI features.
    link: /asr-pipeline
    linkText: Open ASR guide
  - title: Label who said what
    details: Voice embeddings distinguish speakers, and a global roster remembers frequent attendees. If automatic labels are wrong, you can merge, rename, or reassign them.
    link: /speakers
    linkText: Open speakers guide
  - title: Save each meeting separately
    details: Every live session saves its transcript and optional audio in one folder. Reopen it later to continue recording, translate, or summarize it.
    link: /sessions
    linkText: Open resume guide
  - title: Share without extra models
    details: One computer transcribes and hosts the session on the LAN. Other participants can follow finalized captions in a browser or CLI without downloading ASR models.
    link: /architecture
    linkText: Open architecture
  - title: Terminal-first, three UI languages
    details: A fullscreen TUI for the host. Switch the interface among English, 中文, and 日本語 — independent of the language you recognize.
    link: /tui-i18n
    linkText: Open TUI guide
---
