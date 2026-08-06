---
title: "识别管线"
description: "直播阶段 1. 采集 — mic / loopback / both → 16 kHz float32 PCM 2. VAD（Silero） — 切成语音段 3. ASR（SenseVoice） — 段级离线解码；语种 auto zh en ja ko yue 4. 说话人识别 — 计算声纹向量（e"
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["project", "asr"]
isPinned: false
growthStage: "budding"
---
## 直播阶段

1. **采集** — mic / loopback / both → 16 kHz float32 PCM  
2. **VAD（Silero）** — 切成语音段  
3. **ASR（SenseVoice）** — 段级离线解码；语种 `auto|zh|en|ja|ko|yue`  
4. **说话人识别** — 计算声纹向量（embedding），并通过多个时间窗投票  
5. **话轮合并** — 可选择合并同一说话人的连续短字幕  
6. **后处理** — 清理文本并应用 `replace.json` 中的替换规则  
7. **输出最终字幕** — 写入 TUI 历史、JSONL 会话文件，并发送到局域网客户端  
8. **AI**（可选）— 纠错和/或翻译；翻译从不覆盖 `text`

执行步骤 3 时，界面可通过 **live** 行显示「识别中…」状态，但不会生成虚假的临时文字。

## 为什么字幕会「慢半拍」

SenseVoice 使用**离线分段识别**：程序需要先等待 VAD 判定一个语音段结束（检测到静音或达到最长时长），再由 CPU 解码，最后才会调用可选的 AI。因此，字幕不会逐字出现。

| 旋钮 | Balanced 默认 | 更跟手的会 |
|------|---------------|------------|
| `minSilenceDuration` | 0.6 s | 0.25–0.35 s |
| `maxSpeechDuration` | 30 秒 | 6–9 秒 |
| VAD 预设 | Balanced | **Meeting** / Aggressive |
| AI 翻译 | 关闭 | 优先考虑速度时保持关闭 |

## VAD 预设

`src/types.ts` 中 `VAD_PRESETS`。TUI：设置 → VAD 预设。

| Id | minSilence | maxSpeech | 意图 |
|----|------------|-----------|------|
| `balanced` | 0.6 | 30 | 默认 |
| `meeting` | 0.32 | 9 | 多人轮流（推荐） |
| `lowLatency` | 0.22 / 0.28 | 8 / 12 | 根据 SenseVoice / Fun-ASR-Nano 自动调整 |
| `smooth` | 0.4 | 12 | 少碎句 |
| `aggressive` | 0.25 | 6 | 短切 + 靠 turn 合并 |

选择预设后，如果再手动修改具体数值，当前预设会显示为 `custom`。

## 同说话人 turn 合并

配置键 `speakerTurn`（默认 `enabled`、 `maxGapSec=1.4`、`maxTurnSec=24`、`idleMs=4000`、`maxChunks=3`）。

**目的：** 按完整的「话轮」调用一次 AI，避免每个 VAD 短片段都单独请求 AI。

## 本地整理（`replace.json`）

完成话轮合并后、调用 AI 前，程序会清理多余空白和重复标点，并按照最长匹配优先的规则应用词典替换。修改 `replace.json` 后，程序会根据文件更新时间自动重新加载。

## AI

- OpenAI 兼容 `chat/completions`  
- `--ai` / `--ai-correct` / `--ai-translate`  
- TUI Provider 预设（OpenAI、Gemini 兼容端点、DeepSeek、Groq、OpenRouter、Ollama…）  
- **corrected** 保持源语；**translation** 单独字段/行  

## 引擎（现在 vs 未来）

| 引擎 | 模式 | 状态 |
|------|------|------|
| SenseVoice | Offline + VAD 模拟流式 | **默认** |
| Fun-ASR-Nano | Offline + VAD；中文、英文、日文 | 可用 |
| ReazonSpeech | Offline Zipformer Transducer；日语优化 | 可用 |
| Online zipformer | 真 partial | 路线图 |
