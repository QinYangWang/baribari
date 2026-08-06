---
title: "配置说明"
description: "配置目录 默认（可用 BARIBARI CONFIG DIR 覆盖）： text ~/.config/baribari/ ├── config.json 持久化设置 ├── replace.json 本地非 AI 词典与清理 ├── models/ VAD / ASR / 说话人模型 ├── ses"
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["configure"]
isPinned: false
growthStage: "evergreen"
---
## 配置目录

默认（可用 `BARIBARI_CONFIG_DIR` 覆盖）：

```text
~/.config/baribari/
├── config.json      # 持久化设置
├── replace.json     # 本地非 AI 词典与清理
├── models/          # VAD / ASR / 说话人模型
├── sessions/        # 自动保存的会议
├── speakers/        # 全局声纹名册
└── recordings/      # 旧版 / 回退 WAV 目录
```

CLI 参数始终覆盖 `config.json`。界面语言存为 `uiLang`，首次运行缺失时会询问。

## 首次界面语言

列表为 `1) 中文` · `2) 日本語` · `3) English（默认）`。回车 / 空输入保持 **English**。数字与屏幕顺序一致。

## VAD 预设

TUI：**设置 → VAD 预设**（`←` / `→`）。选择预设会写入数值字段（之后微调 → 显示为 *custom*）。

| 预设 | 最小静音 | 最长语音 | 意图 |
|------|----------|----------|------|
| **均衡**（默认） | 0.6s | 30s | 少切分、更长句 |
| **会议** | 0.32s | 9s | 多人轮流（推荐） |
| **低延迟** | 0.22s / 0.28s | 8s / 12s | 更快出最终句 |
| **顺滑** | 0.4s | 12s | 更少碎片 |
| **激进** | 0.25s | 6s | 短切分，依赖同说话人合并 |

CLI 仍可用 `--vad-min-silence` 等做一次性覆盖。

## 同说话人回合合并

同一说话人的短 VAD 最终句可在 AI 纠错/翻译前合并成一个「回合」。配置键 `speakerTurn`：

| 字段 | 默认 | 含义 |
|------|------|------|
| `enabled` | `true` | 总开关 |
| `maxGapSec` | `1.4` | 仍可合并的最大间隔 |
| `maxTurnSec` | `24` | 强制提交进行中的回合 |
| `idleMs` | `4000` | 末段后静默多久再提交 + AI |
| `maxChunks` | `3` | 每回合最多微段数 |

## 本地润色（无 AI）

ASR（及同说话人合并）之后，文本经 `replace.json` 清理，**再**可选送 AI：

```json
{
  "enabled": true,
  "replacements": [
    { "from": "日言語", "to": "日本語" },
    { "from": "ズーム", "to": "Zoom" }
  ]
}
```

也可用扁平映射。最长优先匹配。内置清理会折叠重复标点、NFKC、CJK 空格。按 mtime 热重载，下一段即可生效。

## 环境变量

| 变量 | 用途 |
|------|------|
| `BARIBARI_CONFIG_DIR` | 配置 / 模型 / 录音根目录 |
| `BARIBARI_UI_LANG` | `zh` \| `ja` \| `en` |
| `BARIBARI_AI_KEY` | 优先 API 密钥 |
| `OPENAI_API_KEY` | 回退密钥 |
| `BARIBARI_NO_UPDATE_CHECK` | 设为 `1` 关闭启动时 npm 版本检查 |

版本检查在后台跑一次，网络错误静默忽略。

## 自定义模型路径

```json
{
  "modelsDir": "/path/to/models",
  "spkEngine": "eres2net-large",
  "models": {
    "vad": "/path/to/silero_vad.onnx",
    "senseVoiceDir": "/path/to/sense-voice-dir",
    "spkEres2netLarge": "/path/to/eres2net.onnx",
    "spkCampplus": "/path/to/campplus.onnx"
  }
}
```

随时打印解析路径：

```bash
baribari paths
```

另见 [文件与路径](/baribari/wiki/zh/reference/files) 与 [模型与 AI](/baribari/wiki/zh/configure/models-ai)。
