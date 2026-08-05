---
title: Why local-first meeting transcription
description: Meetings are private by default — keep speech on your machine.
sidebar: false
---

<p class="bb-blog-back"><a href="./">← Blog</a></p>

# Why local-first meeting transcription

<p class="bb-blog-meta"><time datetime="2026-08-05">August 5, 2026</time></p>

Meeting audio is not a casual log file. It carries names, product plans, hiring conversations, and the awkward half-sentences people only say because the room feels private. Shipping that stream to a remote ASR service by default is a product choice — and it is not the one baribari makes.

## Speech stays on the machine

baribari runs **Silero VAD** and local ASR engines (SenseVoice, Fun-ASR-Nano, ReazonSpeech) on your computer. Speaker embeddings run locally too. The network is not required to get captions on screen.

That does not mean “never use the cloud.” It means the default path works offline after models are downloaded, and nothing leaves the machine unless you deliberately turn a feature on.

## AI is a tool, not the product

Correction, translation, and summaries use an **OpenAI-compatible** endpoint you configure. Keys stay in your environment or settings. Original text is never replaced by a translation line — the source language stays first-class.

If you never set a provider, baribari still works: local polish via `replace.json`, speaker labels, sessions, LAN share of finals.

## A session, not a pastebin

Every live meeting is saved under a session directory you can list, resume, continue, and share. Captions, speaker maps, and optional audio stay together. That is the unit of work — not a one-shot transcript blob that disappears when the terminal closes.

## Share without cloning the stack

LAN share lets colleagues follow finalized captions in a browser while **one host** runs models. Peers do not download ASR weights. The host remains the trust boundary.

## What we will not trade away

- Silent cloud ASR with no off switch
- Replacing source text with model output by default
- Treating meetings as ephemeral chat instead of durable sessions

Local-first is not nostalgia for offline software. It is a clear default for a tool that sits in rooms where people expect discretion — and still leaves the door open when you want a model’s help.

---

Next: [Quick start](../quick-start) · [Architecture](../architecture)
