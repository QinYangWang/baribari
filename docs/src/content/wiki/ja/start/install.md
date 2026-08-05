---
title: "インストール"
description: "要件 Node.js 18 以上 利用可能なマイク（Windows はシステム音声 / loopback にも対応） モデル用のディスク容量（VAD + ASR。話者モデルは任意） Linux と macOS は現在マイク入力が中心です。Windows は mic 、 loopback 、 both"
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["start", "install"]
isPinned: true
growthStage: "evergreen"
---
## 要件

- **Node.js 18 以上**
- 利用可能なマイク（Windows はシステム音声 / loopback にも対応）
- モデル用のディスク容量（VAD + ASR。話者モデルは任意）

Linux と macOS は現在マイク入力が中心です。Windows は `mic`、`loopback`、`both` に対応します。

## npm からインストール

```bash
npm install -g baribari
```

確認：

```bash
baribari -V
baribari doctor
```

## モデルの取得

```bash
baribari setup --download
```

環境を確認し、不足している VAD / ASR / 話者モデルをダウンロードします。

```bash
baribari setup                     # 状態とガイド
baribari setup --download -y       # 非対話
baribari setup --skip-spk          # 話者モデルなし
baribari setup --models-dir D:/m   # カスタムモデル root
```

## シェル補完（任意）

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

## 次へ

[クイックスタート](/baribari/wiki/ja/start/quick-start) へ進んでください。
