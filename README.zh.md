<div align="center">

# baribari

**终端里的实时会议转写**

SenseVoice · Silero VAD · 说话人 · AI 纠错/翻译 · 局域网共享

<img src="./docs/public/screenshots/demo-mode.png" alt="Demo 会话，包含时间轴、说话人标签、原文和译文" width="960">

[![npm](https://img.shields.io/npm/v/baribari.svg)](https://www.npmjs.com/package/baribari)
[![Node](https://img.shields.io/node/v/baribari.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

[English](./README.md) · **中文** · [日本語](./README.ja.md)

[文档站点](https://qinyangwang.github.io/baribari/) · [设计文档](./docs/)

**Bash**

```bash
npm i -g baribari && baribari setup --download && baribari
```

**PowerShell**

```powershell
npm i -g baribari; baribari setup --download; baribari
```

**CMD**

```bat
npm i -g baribari & baribari setup --download & baribari
```

</div>

---

## 为什么用 baribari？

| 能力 | 说明 |
|------|------|
| **会议专用 TUI** | 集中显示说话人、实时转写、设备、录音和共享状态 |
| **本地语音识别** | 可在 SenseVoice 与 Fun-ASR-Nano 之间切换，均搭配 Silero VAD 在本机运行 |
| **说话人标注** | 通过声纹区分说话人；全局名册可在下次会议中自动匹配固定与会者 |
| **可选 AI 增强** | 兼容 OpenAI API，可用于纠错、翻译和总结，并提供常用服务商预设 |
| **自动保存会话** | 使用 `resume` 回放、续录、翻译、总结或重新共享会议 |
| **局域网共享** | 一台设备负责转写，其他人通过浏览器或 CLI 查看字幕 |
| **集中存储配置** | 配置、模型和会话默认保存在 `~/.config/baribari` |

---

## 界面预览

| 实时转写 | 设置 |
|:---:|:---:|
| ![实时转写界面，左侧显示说话人，右侧显示正在生成的日文字幕](./docs/public/screenshots/live-transcription.png) | ![设置面板，可调整界面语言、语音识别、AI 和音频选项](./docs/public/screenshots/settings.png) |
| **Demo 与回放模式** | **网页共享** |
| ![Demo 会话，包含时间轴、说话人标签、原文和译文](./docs/public/screenshots/demo-mode.png) | ![浏览器中的共享会话，按说话人显示实时字幕和译文](./docs/public/screenshots/web-share.png) |

---

## 目录

- [安装](#安装)
- [快速开始](#快速开始)
- [CLI](#cli)
- [TUI 快捷键](#tui-快捷键)
- [配置](#配置)
- [模型](#模型)
- [AI 增强](#ai-增强)
- [局域网共享](#局域网共享)
- [开发](#开发)
- [许可证](#许可证)

---

## 安装

**运行要求：** Node.js **≥ 18**。在 **Windows** 上可同时采集麦克风和系统声音；Linux/macOS 主要支持麦克风采集，具体取决于 `node-cpal`。

```bash
npm install -g baribari
```

也可以从源码安装：

```bash
git clone https://github.com/QinYangWang/baribari.git
cd baribari
npm install
npm run build
npm link
```

> **Shell 提示：** 在一行中连续执行命令时，bash/zsh/fish 使用 `&&`，PowerShell 使用 `;`，cmd 使用 `&`。下方的多行命令可逐行执行。

---

## 快速开始

```bash
# 首次使用：选择界面语言和识别模型，然后下载
baribari setup --download

# 开始实时转写
baribari

# 如遇问题，检查运行环境
baribari doctor
```

安装时可选择 SenseVoice、Fun-ASR-Nano，或同时安装两个模型。SenseVoice 是推荐
的默认选项；只选择一个模型时，它也会成为当前使用的识别模型。

---

## CLI

```text
baribari [选项]                开始实时转写（默认）
baribari setup [选项]          检查 / 下载模型
baribari paths | config        打印配置与模型路径
baribari devices               列出麦克风
baribari doctor                检查并诊断运行环境
baribari session list          列出已保存会议
baribari session rm <id>       删除会话
baribari resume [id]           浏览或回放会话（默认打开 demo）
baribari demo                  等同于 baribari resume demo
baribari join <url>            加入局域网共享（仅接收）
baribari completion [shell]    bash | zsh | fish | powershell
baribari -h | -V               帮助 / 版本
```

### 会话

每次实时转写都会自动保存到 `~/.config/baribari/sessions/<id>/`。字幕写入 JSONL 文件；如果按 `r` 开始录音，音频会写入 `audio.wav`。

```bash
baribari session list
baribari session rm ses_完整id           # 再输入完整 id 确认
baribari session rm ses_xxx -y          # 跳过确认
baribari session rm ses_ab --allow-prefix
baribari resume demo
baribari resume ses_xxxx
```

默认情况下，删除会话需要提供 **完整的会话 ID**，并再次输入以确认。只有在前缀唯一且使用 `--allow-prefix` 时，才能通过 ID 前缀删除。

**回放模式快捷键**（与实时转写模式不同，以 TUI 底栏提示为准）：

| 键 | 作用 |
|----|------|
| `↑` `↓` | 上/下一条字幕（播放头跟随） |
| `←` `→` | 时间轴 −2s / +2s |
| `Space` / `p` | 播放/暂停（音频建议 `ffplay`） |
| `c` | 在同一会话中**继续录制**（demo 不支持） |
| `t` / `T` | 翻译当前字幕 / 翻译所有尚未翻译的字幕 |
| `m` | 会议总结（字幕区） / **合并**说话人（说话人栏） |
| 合并模式 | 全部 `○` · `空格` 标 `→` · `Esc` → `y` 保存 / `n` 放弃 |
| `s` | 设置（内：`↑↓` 移动 `←→` 改值 `Esc` 关闭） |
| `e` | 重命名会话 |
| `h` | 开启或关闭局域网共享（不会退出回放） |
| `q` | 退出 |

回放模式不支持实时转写模式中的 `r` 录音、`Tab` 切换区域和 `1–9` 指派说话人。

程序会尽量合并 `audio-part-*.wav` 和 `audio.wav` 等多段音频；续录产生的 PCM 音频会追加到原文件。可运行 `baribari resume demo` 体验回放模式。

### 常用参数

| 参数 | 说明 |
|------|------|
| `--lang` | 识别：`auto\|zh\|en\|ja\|ko\|yue` |
| `--ui-lang` | 界面：`zh\|ja\|en` |
| `--source` | `mic\|loopback\|both`（Windows） |
| `-o, --output` | 转写追加到文件 |
| `--ai` / `--no-ai` | AI 增强总开关 |
| `--ai-correct` / `--no-ai-correct` | AI 纠错（与翻译独立） |
| `--ai-translate` | 翻译目标语 |
| `--share` / `join` | 局域网共享 |
| `--vad-min-silence` | 持续静音多久后切分语音段（值越小，字幕更新越快） |
| `--vad-max-speech` | 单个语音段的最长时长，超出后强制切分 |

```bash
# 补全示例（bash）
eval "$(baribari completion bash)"
```

更多示例与环境变量见 [English README](./README.md)。

---

## 全局说话人名册

声纹与显示名保存在：

```text
~/.config/baribari/speakers/roster.json
```

- 每次开始实时转写时，程序会先把名册加载到说话人槽位 `1…G`。
- 在 TUI 中按 `Tab` 切换到说话人列表，再按 `Enter` 为自动检测到的说话人改名；该说话人随后会写入全局名册。
- 以后检测到匹配的声纹时，程序会自动标注姓名；退出时会更新并保存声纹中心值（EMA）。
- 如果不需要区分说话人，可使用 `--no-spk`。

---

## TUI 快捷键

| 键 | 作用 |
|----|------|
| `p` / `Space` | 暂停 / 继续听 |
| `s` | 设置（可滚动分组） |
| `h` | 开/关局域网共享 |
| `r` | 录音 → 会话 `audio.wav` |
| `c` | 清空屏幕转写（不删会话文件） |
| `Tab` | 焦点：说话人 ↔ 转写 |
| `1`–`9` | 将上一段指派给说话人 *N*（说话人栏焦点） |
| `m` | **合并**说话人（说话人列表：源 → 目标 → Enter） |
| `e` | 会话改名 |
| `↑` `↓` / 滚轮 | 滚动转写（滚轮上=更早；`g` 跳回实时底部） |
| `q` | 退出 |

**界面布局：** 说话人 · 实时转写 · 设备 / 录音 / 共享

**实时状态与最终字幕：** 转写栏底部有一行可刷新的 **live 状态**。SenseVoice 解码当前 VAD 语音段时，这一行会显示「识别中…」等状态，但不会生成虚假的临时文字。语音段识别完成后，live 状态会清空，最终字幕（**final**）会追加到历史列表。会话文件、局域网共享和 AI 纠错/翻译只处理 final 字幕。

底层采用 VAD 切段和 SenseVoice 离线识别，并非逐字输出的流式识别引擎。

**设置：** 识别、AI（含翻译目标与 Provider 预设）、音频、共享、VAD 预设、界面语言。

---

## 配置

```text
~/.config/baribari/
├── config.json
├── replace.json     # 本地词典纠错（非 AI，首次启动自动生成示例）
├── models/
├── sessions/
├── speakers/        # 全局声纹名册 roster.json
└── recordings/
```

首次运行界面语言列表：`1) 中文` · `2) 日本語` · `3) English (default)`。直接回车为 **English（第 3 项）**；数字与屏幕列表一致。

**VAD 预设（设置里 ←→）：** 均衡（默认）· 会议（多人轮流，推荐）· 低延迟 · 顺滑 · 激进。低延迟模式下，SenseVoice 约等待 `0.22s` 静音，Fun-ASR-Nano 约等待 `0.28s`；Nano 会保留稍长的语音段以维持上下文。

**同一说话人的语音段合并（`speakerTurn`）：** 默认最多合并同一说话人的 3 个连续短段，再交给 AI 处理。详见 [识别管线](./docs/zh/asr-pipeline.md)。

**本地文本整理（无需 AI）：** 完成 ASR 和同一说话人语音段合并后、调用可选 AI 之前，程序会清理多余空白和重复标点，并应用 `replace.json` 中的替换规则。该文件支持 `{ "replacements":[{"from":"…","to":"…"}] }`，也支持扁平格式 `{ "错词":"正词" }`。修改后会根据文件更新时间自动重新加载。

环境变量：`BARIBARI_CONFIG_DIR`、`BARIBARI_UI_LANG`、`BARIBARI_AI_KEY` / `OPENAI_API_KEY`、`BARIBARI_NO_UPDATE_CHECK=1`。baribari 仅在启动时后台检查一次 npm 最新版本，不阻塞启动，网络失败时不会显示错误。

---

## 模型

SenseVoice 是默认模型。在 **设置 → 语音识别 → 识别模型** 中按 `←` / `→`
即可切换到 Fun-ASR-Nano。如果本地尚未安装，baribari 会先询问是否下载
（解压后约 1 GB）。你可以留在下载界面等待，也可以转入后台并继续实时转写；宽屏
布局会在右侧详情栏持续显示下载阶段和进度。下载成功后才会切换模型。也可使用
`baribari --asr-engine funasr-nano` 直接启动。

```bash
baribari setup --download
baribari paths
```

如需手动下载模型或自定义模型路径，请参阅 [英文 README 的 Models 章节](./README.md#models)。

---

## AI 增强

```bash
export BARIBARI_AI_KEY=sk-...
baribari --ai --ai-translate en --ai-model gpt-4o-mini
```

支持兼容 OpenAI 的 Chat Completions API。原文和译文分别显示，译文不会覆盖原文。在 TUI 的 **设置 → AI → Provider** 中，可使用 `←` `→` 切换 OpenAI、Gemini、DeepSeek、Groq、OpenRouter、Ollama 等预设。更多配置请参阅 [英文 README](./README.md#ai-enhancement)。

---

## 局域网共享

```bash
baribari --share
baribari join http://192.168.x.x:8787/
```

---

## 文档站点

设计说明在 [`docs/`](./docs/)，可用 GitHub Pages（VitePress）发布：

```bash
npm run docs:dev
npm run docs:build
```

仓库启用 **Settings → Pages → Source: GitHub Actions** 后访问：

`https://qinyangwang.github.io/baribari/`

---

## 开发

```bash
npm install
npm run hooks:install    # 提交前 typecheck + check:i18n
npm run typecheck
npm run check:i18n       # 三语 locale 键一致
npm run precommit
npm run docs:dev
npm run dev -- --demo
```

发布：推送与 `package.json` 版本一致的 `v*` tag（如 `v1.5.0`）→ GitHub Actions → npm。

---

## 许可证

[MIT](./LICENSE)

<div align="center">

[npm](https://www.npmjs.com/package/baribari) · [Issues](https://github.com/QinYangWang/baribari/issues)

</div>
