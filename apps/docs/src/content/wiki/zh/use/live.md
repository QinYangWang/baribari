---
title: "实时转写"
description: "Live transcription keys, layout, and capture flow."
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["use", "tui"]
isPinned: false
growthStage: "evergreen"
---
在任意目录开始一场实时会议：

```bash
baribari
```

baribari 采集音频，运行本地 VAD + ASR，标注说话人，并把会话自动保存到 `~/.config/baribari/sessions/`。

![带说话人标签的实时转写](/baribari/screenshots/live-transcription.png)

## 实时 TUI 快捷键

| 键 | 作用 |
|----|------|
| `p` / `Space` | 暂停 / 继续听音 |
| `s` | 设置（可滚动分组） |
| `h` | 切换局域网共享 |
| `r` | 切换录音 → 会话 `audio.wav` |
| `c` | 清空屏幕字幕（不删除会话文件） |
| `Tab` | 说话人 ↔ 字幕焦点 |
| `1`–`9` | 把最近一段标给说话人 *N*（说话人栏焦点时） |
| `m` | **合并**说话人（说话人列表内） |
| `↑` `↓` / 滚轮 | 滚动字幕（`g` = 跳到实时底部） |
| `q` | 退出 |

**布局：** 说话人 · 实时字幕 · 设备 / 录音 / 共享

## 实时行与最终句

解码当前 VAD 段时，字幕区底部保留一行可刷新的**实时状态**（如「识别中…」，不会编造词）。段落结束后该行清空，并追加一条**最终**字幕。

会话文件、局域网共享与 AI 纠错/翻译**只用最终句**。

## 时序

字幕在 **VAD 结束一段语音之后** 出现，而不是逐词流式。

| 设置 | 默认 | 效果 |
|------|------|------|
| 静音切分（`--vad-min-silence`） | **0.6s**（均衡） | 安静这么久 → 切断并识别 |
| 最长语音（`--vad-max-speech`） | **30s** | 强制切断长独白 |
| 最短语音（`--vad-min-speech`） | **0.4s** | 丢弃过短噪声 |

多人轮流发言时，可在设置里选 VAD 预设 **会议**，或例如 `--vad-min-silence 0.32 --vad-max-speech 9`。

## 设置分组

实时 TUI 中按 `s` 可调整：

- 识别（语言、ASR 模型）
- AI（开关、翻译目标、提供方、密钥、模型）
- 音频（来源、设备）
- 共享
- VAD 预设与微调
- 界面语言

详见 [配置说明](/baribari/wiki/zh/configure/configuration) 与 [模型与 AI](/baribari/wiki/zh/configure/models-ai)。

## 常用启动参数

```bash
baribari --lang ja --ui-lang zh
baribari --source both -o meeting.txt
baribari --no-spk
baribari --record ./meeting.wav
baribari --ai --ai-translate en
baribari --share --share-port 8788
```

完整列表：[CLI 参考](/baribari/wiki/zh/reference/cli)。
