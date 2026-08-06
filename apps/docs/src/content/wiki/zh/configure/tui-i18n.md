---
title: "TUI 与界面多语言"
description: "直播布局 1. 说话人 — 名册 + 本场说话人、改名、合并、指派 2. 转写 — final 历史 + 底部一条 live 3. 侧栏 — 设备、录音、共享 URL 按 s 打开设置，无需退出 TUI 即可调整界面语言、语音识别、AI、音频、共享和 VAD 选项。 Live vs final ki"
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["configure", "tui", "i18n"]
isPinned: false
growthStage: "evergreen"
---
## 直播布局

1. **说话人** — 名册 + 本场说话人、改名、合并、指派  
2. **转写** — final 历史 + 底部一条 **live**  
3. **侧栏** — 设备、录音、共享 URL  

![实时转写界面，左侧显示说话人，右侧显示正在生成的日文字幕](/baribari/screenshots/live-transcription.png)

按 `s` 打开设置，无需退出 TUI 即可调整界面语言、语音识别、AI、音频、共享和 VAD 选项。

![设置面板，可调整界面语言、语音识别、AI 和音频选项](/baribari/screenshots/settings.png)

## Live vs final

| kind | UI | 落盘 | 共享 | AI |
|------|-----|------|------|-----|
| `partial` | 刷新 live 行 | 否 | 默认否 | 否 |
| `final` | 进历史并清空 live | 是 | 是 | 是 |

使用 SenseVoice 时，partial 通常只是「识别中…」等**状态信息**，并非临时的流式字幕。未来的在线识别引擎可以通过同一通道发送真实的中间结果。

在 **设置 → 语音识别 → 识别模型** 中按 `←` / `→`，可以循环选择 SenseVoice、
Fun-ASR-Nano 与 ReazonSpeech（日语优化）。若本地缺少所选模型，可选择留在下载界面，或让它
转入后台并继续实时转写。宽屏布局会在右侧详情栏持续显示下载阶段和进度；这里也会
显示当前的 VAD 切断预设、结束静音和最长语音。安装成功前仍使用当前模型。

## 直播快捷键摘要

`p`/`Space` 暂停 · `s` 设置 · `h` 共享 · `r` 录音 · `c` 清屏 · `Tab` 焦点 · `1–9` 指派 · `m` 合并 · `e` 会话改名 · 滚轮/`g` · `q` 退出。详见 README。

交互运行 `baribari setup` 时，也会询问要安装 SenseVoice（推荐）、Fun-ASR-Nano、
ReazonSpeech，还是三个模型都安装。无人值守安装可使用 `--yes`，它会保留当前配置的识别模型并跳过询问。

## 界面语言 vs 识别语言

| | |
|--|--|
| **uiLang** | `zh` \| `ja` \| `en` — TUI/CLI 文案 |
| **lang** | ASR `auto` \| `zh` \| `en` \| `ja` \| `ko` \| `yue` |

两项设置相互独立。首次运行且尚未配置 `uiLang` 时，会显示：

```text
1) 中文
2) 日本語
3) English (default)
```

回车 → **English（第 3 项）**；数字按列表下标。可用 `--ui-lang` / `BARIBARI_UI_LANG` / 设置修改。

## 工程

- `src/i18n/locales/{zh,ja,en}.ts`  
- `pnpm check:i18n`
- 新增文案必须三语 + 类型一并改
