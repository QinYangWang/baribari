---
title: "安装"
description: "在 Windows、macOS 或 Linux 安装 baribari，准备音频设备并完成本地模型初始化。"
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["start", "install"]
isPinned: true
growthStage: "evergreen"
---
## 环境要求

- **Node.js 18 或更高**
- 可用的麦克风（Windows 还支持系统声 / loopback）
- 足够存放模型的磁盘空间（VAD + ASR；说话人模型可选）

Linux 与 macOS 目前以麦克风采集为主。Windows 支持 `mic`、`loopback` 与 `both`。

## 从 npm 安装

```bash
npm install -g baribari
```

验证：

```bash
baribari -V
baribari doctor
```

## 下载模型

```bash
baribari setup --download
```

检查环境并下载缺失的 VAD / ASR / 说话人模型。常用变体：

```bash
baribari setup                     # 状态与引导
baribari setup --download -y       # 非交互
baribari setup --skip-spk          # 不下载说话人模型
baribari setup --models-dir D:/m   # 自定义模型目录
```

## Shell 补全（可选）

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

## 下一步

继续阅读 [快速开始](/baribari/wiki/zh/start/quick-start)。
