<div align="center">

# baribari

**终端里的实时会议转写**

SenseVoice · Silero VAD · 说话人 · AI 纠错/翻译 · 局域网共享

[![npm](https://img.shields.io/npm/v/baribari.svg)](https://www.npmjs.com/package/baribari)
[![Node](https://img.shields.io/node/v/baribari.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

[English](./README.md) · **中文** · [日本語](./README.ja.md)

```bash
npm i -g baribari && baribari
```

</div>

---

## 为什么用 baribari？

| 能力 | 说明 |
|------|------|
| **会议向 TUI** | 说话人 · 实时转写 · 设备/录音/共享 |
| **本地识别** | SenseVoice + Silero VAD（转写可不依赖云） |
| **说话人** | 声纹 + 多窗投票，抢话更稳 |
| **可选 AI** | OpenAI 兼容纠错与翻译 |
| **会话** | 自动保存；`resume` 浏览 · 续录 · AI 翻译/总结 · TUI 内共享 |
| **局域网共享** | 主机广播，浏览器或 CLI 加入 |
| **用户目录配置** | `~/.config/baribari` |

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

**要求：** Node.js **≥ 18**。麦+系统声在 **Windows** 上最完整；Linux/macOS 以麦克风为主（取决于 `node-cpal`）。

```bash
npm install -g baribari
```

源码安装：

```bash
git clone https://github.com/QinYangWang/baribari.git
cd baribari && npm install && npm run build && npm link
```

---

## 快速开始

```bash
baribari setup --download   # 首次：界面语言 + 下载模型
baribari                    # 全屏 TUI 转写
baribari doctor             # 环境自检
```

---

## CLI

```text
baribari [选项]                开始实时转写（默认）
baribari setup [选项]          检查 / 下载模型
baribari paths | config        打印配置与模型路径
baribari devices               列出麦克风
baribari doctor                诊断
baribari session list          列出已保存会议
baribari session rm <id>       删除会话
baribari resume [id]           回放会话（默认 demo）
baribari demo                  等同 resume demo
baribari join <url>            加入局域网共享
baribari completion [shell]    bash | zsh | fish | powershell
baribari -h | -V               帮助 / 版本
```

### 会话

每次开会自动保存到 `~/.config/baribari/sessions/<id>/`（字幕 JSONL；按 `r` 录音则写入 `audio.wav`）。

```bash
baribari session list
baribari session rm ses_完整id           # 再输入完整 id 确认
baribari session rm ses_xxx -y          # 跳过确认
baribari session rm ses_ab --allow-prefix
baribari resume demo
baribari resume ses_xxxx
```

删除默认要求 **完整 session id**（需再输入一次确认）。前缀仅在唯一且加 `--allow-prefix` 时可用。

**回放快捷键（与实时会议不同，与 TUI 底栏一致）：**

| 键 | 作用 |
|----|------|
| `↑` `↓` | 上/下一条字幕（播放头跟随） |
| `←` `→` | 时间轴 −2s / +2s |
| `Space` / `p` | 播放/暂停（音频建议 `ffplay`） |
| `c` | **续录**到同一会话（demo 不可） |
| `t` / `T` | 翻译当前 / 全部缺失 |
| `m` | 会议总结 → `summary.md` |
| `s` | 设置（内：`↑↓` 移动 `←→` 改值 `Esc` 关闭） |
| `e` | 改名 |
| `h` | 开/关局域网共享（不退出） |
| `q` | 退出 |

实时会议的 `r` 录音、`Tab` 切换区、`1–9` 指派说话人在 resume **不可用**。

多段 `audio-part-*.wav` + `audio.wav` 会尽量合并；续录时 **追加** PCM。本地可试：`baribari resume demo`。

### 常用参数

| 参数 | 说明 |
|------|------|
| `--lang` | 识别：`auto\|zh\|en\|ja\|ko\|yue` |
| `--ui-lang` | 界面：`zh\|ja\|en` |
| `--source` | `mic\|loopback\|both`（Windows） |
| `-o, --output` | 转写追加到文件 |
| `--ai` / `--ai-translate` | AI 增强 / 翻译目标 |
| `--share` / `join` | 局域网共享 |
| `--vad-min-silence` | 静音多久切段（越小出字越勤） |

```bash
# 补全示例（bash）
eval "$(baribari completion bash)"
```

更多示例与环境变量见 [English README](./README.md)。

---

## TUI 快捷键

| 键 | 作用 |
|----|------|
| `p` | 暂停 |
| `s` | 设置 |
| `h` | 共享 |
| `r` | 录音 |
| `Tab` | 切换说话人/转写焦点 |
| `1`–`9` | 指派说话人 |
| `q` | 退出 |

字幕在 **VAD 切段结束后** 才出现（默认静音约 0.6s 切一段），不是逐字流式。

---

## 配置

```text
~/.config/baribari/
├── config.json
├── models/
└── recordings/
```

环境变量：`BARIBARI_CONFIG_DIR`、`BARIBARI_UI_LANG`、`BARIBARI_AI_KEY` / `OPENAI_API_KEY`。

---

## 模型

```bash
baribari setup --download
baribari paths
```

手动下载与路径覆盖见英文 README 的 Models 一节。

---

## AI 增强

```bash
export BARIBARI_AI_KEY=sk-...
baribari --ai --ai-translate en
```

支持 OpenAI 兼容 Chat Completions；原文与译文分行显示，互不覆盖。

---

## 局域网共享

```bash
baribari --share
baribari join http://192.168.x.x:8787/
```

---

## 开发

```bash
npm install
npm run hooks:install    # 提交前 typecheck + check:i18n
npm run typecheck
npm run check:i18n       # 三语 locale 键一致
npm run precommit
npm run dev -- --demo
```

发布：推送与 `package.json` 版本一致的 `v*` tag（GitHub Actions → npm），或本机 `npm publish`。

---

## 许可证

[MIT](./LICENSE)

<div align="center">

[npm](https://www.npmjs.com/package/baribari) · [Issues](https://github.com/QinYangWang/baribari/issues)

</div>
