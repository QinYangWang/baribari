<div align="center">

<img src="./docs/public/brand/baribari-logo.png" alt="baribari" width="72">

# baribari

[文档](https://qinyangwang.github.io/baribari/zh/) · [安装](https://qinyangwang.github.io/baribari/wiki/zh/start/install/) · [快速开始](https://qinyangwang.github.io/baribari/wiki/zh/start/quick-start/)

[English](./README.md) · **中文** · [日本語](./README.ja.md)

[![npm](https://img.shields.io/npm/v/baribari.svg)](https://www.npmjs.com/package/baribari)
[![Node](https://img.shields.io/node/v/baribari.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

</div>

---

<img src="./docs/public/screenshots/demo-mode.png" alt="Demo 会话，包含时间轴、说话人标签、原文和译文" width="960">

**让每次对话成为可共享、可延续的知识。**

面向实时理解、说话人记忆、持久会话和自部署协作的本地语音智能。

- **默认本地处理** — SenseVoice、Fun-ASR-Nano、ReazonSpeech 和 Silero VAD 都在本机运行。
- **知道谁说了什么** — 声纹标注每段发言，全局名册记住常客。
- **保存的是会话** — 可回放、续录、修订、翻译、总结或共享。
- **需要时再使用 AI** — 纠错、翻译和总结只调用你配置的 OpenAI 兼容服务。
- **一台主机，多人查看** — 局域网向浏览器或 CLI 分享最终字幕。
- **不是转写的终点** — 同一套本地语音底座可以继续扩展搜索、Headless 共享、翻译语音和学习工具。

---

## 安装

```bash
npm install -g baribari
```

需要 **Node.js 18+**。Windows 支持麦克风和系统声；Linux 与 macOS 目前以麦克风为主。

## 快速开始

```bash
baribari setup --download
baribari
```

首次设置选择界面语言、识别模型和声纹模型。之后在能采集会议声音的设备上运行 `baribari`。

```bash
baribari demo     # 内置示例会议
baribari doctor   # 检查音频与模型
```

## 文档

安装设置、快捷键、模型、配置和故障排查都在 **[完整文档](https://qinyangwang.github.io/baribari/zh/)** 中。

## 开发

```bash
git clone https://github.com/QinYangWang/baribari.git
cd baribari
npm install          # Linux 可能需要: npm install --force
npm run build
```

欢迎贡献。请在 [GitHub](https://github.com/QinYangWang/baribari) 开 issue 或 PR。

## 许可证

[MIT](./LICENSE) © baribari 贡献者
