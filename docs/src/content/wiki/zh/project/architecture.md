---
title: "架构"
description: "产品边界 掌控输入： 本地 ASR 是默认路径，云端 AI 必须显式开启。 理解现场： 字幕、说话人、设备与共享状态留在一个连贯客户端里。 保留上下文： 会议是可重新打开的会话，不是一次性的终端输出。 开放输出： 会话和版本化字幕事件可以继续支持搜索、Headless 共享、自动化与语音应用。 保留"
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["project", "architecture"]
isPinned: false
growthStage: "budding"
---
## 产品边界

- **掌控输入：** 本地 ASR 是默认路径，云端 AI 必须显式开启。
- **理解现场：** 字幕、说话人、设备与共享状态留在一个连贯客户端里。
- **保留上下文：** 会议是可重新打开的会话，不是一次性的终端输出。
- **开放输出：** 会话和版本化字幕事件可以继续支持搜索、Headless 共享、自动化与语音应用。
- **保留来源：** 纠错和翻译永远不会覆盖 ASR 原文。

TUI 是第一个客户端，但不是架构边界。长期边界是本地语音引擎、持久会话与稳定事件协议，详见[路线图](/baribari/wiki/zh/project/roadmap)。

## 运行时栈

| 层 | 选型 |
|----|------|
| 语言 | TypeScript → Node ≥ 18 (`type: module`) |
| CLI | `commander` |
| ASR / VAD / 声纹 | `sherpa-onnx-node`（SenseVoice、Fun-ASR-Nano、ReazonSpeech、Silero VAD、3D-Speaker CAM++ / ERes2Net-large） |
| 采集 | `node-cpal` + `bionic-audio`（麦；Windows loopback/both） |
| 共享 | `ws` + 简易 HTTP 页 |
| TUI | 自研 ANSI（`src/tui.ts`），非 Ink/Blessed |

## 总体数据流

```text
采集 → Silero VAD → 所选 ASR（离线段解码）
         → 说话人 embedding / 名册
         → 同说话人 turn 合并
         → replace.json 本地整理
         → emit final → TUI / session / LAN
         → 可选 AI（纠错/翻译）
```

解码期间，界面可以显示 **live** 状态行（`kind: "partial"`）。识别完成后才会生成 final 字幕；只有 final 字幕会写入文件、通过局域网共享或交给 AI 处理。

局域网内的参与者无需在本机运行 ASR，即可通过浏览器查看最终字幕和译文：

![浏览器中的共享会话，按说话人显示实时字幕和译文](/baribari/screenshots/web-share.png)

## 源码地图

| 路径 | 职责 |
|------|------|
| `src/index.ts` | CLI 入口与直播会话编排 |
| `src/transcribe.ts` | VAD + ASR 泵、录音、VAD/音源热更 |
| `src/tui.ts` | 全屏直播 UI + 设置 |
| `src/resume-tui.ts` | 会话浏览、播放、续录、AI 工具 |
| `src/session.ts` | 路径、meta、jsonl、多段音频、删除安全 |
| `src/speaker-tracker.ts` | 模板库 ID + 多窗投票 + 滞后 |
| `src/speaker-models.ts` | 声纹模型目录（路径、默认阈值） |
| `src/speaker-library.ts` | 全局 `roster.json` |
| `src/speaker-turn.ts` | AI 前同说话人合并 |
| `src/postprocess.ts` | 本地词典 / 清理 |
| `src/ai.ts` | Chat Completions + Provider 预设 |
| `src/share-*.ts` | 局域网主机 / 加入 |
| `src/setup.ts` | 首次界面语言 + 模型下载 |
| `src/i18n/` | zh / ja / en |
| `docs/` | 本设计站（Veka (Astro)） |

## 配置布局

默认根目录：`~/.config/baribari`（`BARIBARI_CONFIG_DIR`）。

```text
config.json · replace.json · models/ · sessions/<id>/ · speakers/roster.json · recordings/
```

CLI 标志始终覆盖当次进程的 `config.json`。

## 边界

- **单进程** 持有采集 + ASR + TUI（或 `--no-tui`）。
- **局域网对端** 不跑 ASR，只收 final 事件。
- **AI** 在 final（及 turn 提交）后尽力异步。

## 当前非目标

- 真词级流式 ASR（SenseVoice 为 offline；live 行多为状态 / 未来 online 引擎）。
- 内置虚拟麦同传 / TTS。
- 以完整 offline diarization 作为唯一实时路径（见 [路线图](/baribari/wiki/zh/project/roadmap)）。
