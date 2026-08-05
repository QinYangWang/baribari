---
title: "Install"
description: "Install baribari from npm and download speech models."
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["start", "install"]
isPinned: true
growthStage: "evergreen"
---
## Requirements

- **Node.js 18 or newer**
- A working microphone (Windows also supports system-audio / loopback capture)
- Disk space for models (VAD + ASR; speaker models optional)

Linux and macOS currently focus on microphone capture. Windows supports `mic`, `loopback`, and `both`.

## Install from npm

```bash
npm install -g baribari
```

Check the install:

```bash
baribari -V
baribari doctor
```

## Download models

```bash
baribari setup --download
```

This checks your environment and downloads missing VAD / ASR / speaker models. Useful variants:

```bash
baribari setup                     # status + guide
baribari setup --download -y       # non-interactive
baribari setup --skip-spk          # without speaker model
baribari setup --models-dir D:/m   # custom models root
```

## Shell completion (optional)

```bash
# bash
eval "$(baribari completion bash)"

# zsh
eval "$(baribari completion zsh)"

# fish
baribari completion fish > ~/.config/fish/completions/baribari.fish

# PowerShell
baribari completion powershell | Out-String | Invoke-Expression
```

## Next

Continue with [Quick start](/baribari/wiki/start/quick-start).
