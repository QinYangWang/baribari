---
title: "CLI 参考"
description: "查阅 baribari 命令、全局选项、setup、session、resume、join 与 shell 补全的完整用法。"
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["reference", "cli"]
isPinned: true
growthStage: "evergreen"
---
```text
baribari [选项]                开始实时转写（默认）
baribari setup [选项]          检查 / 下载模型
baribari paths | config        打印配置与模型路径
baribari devices               列出麦克风
baribari doctor                诊断运行环境
baribari session list          列出已保存会议
baribari session rm <id>       删除会话
baribari session path <id>     打印会话目录
baribari resume [id]           浏览或回放会话（默认 demo）
baribari demo                  等同于 resume demo
baribari join <url>            加入局域网共享（仅接收）
baribari completion [shell]    bash | zsh | fish | powershell
baribari -h | -V               帮助 / 版本
```

## 常用选项（实时）

| 参数 | 说明 |
|------|------|
| `--lang <lang>` | 识别：`auto` \| `zh` \| `en` \| `ja` \| `ko` \| `yue` |
| `--asr-engine <engine>` | `sensevoice` \| `funasr-nano` \| `reazonspeech-ja` |
| `--ui-lang <lang>` | 界面：`zh` \| `ja` \| `en` |
| `--source <src>` | `mic` \| `loopback` \| `both`（Windows） |
| `--device <id>` | `baribari devices` 的索引或设备名 |
| `-o, --output <file>` | 追加字幕文本到文件 |
| `--no-spk` | 关闭说话人识别 |
| `--spk-engine <engine>` | `campplus` \| `eres2net-large` |
| `--spk-threshold <n>` | 匹配阈值 `0–1` |
| `--no-tui` | 纯文本模式 |
| `--record <path>` | 启动时开始 WAV 录音 |
| `--record-dir <dir>` | 默认录音目录 |
| `--ai` / `--no-ai` | AI 增强开关 |
| `--ai-correct` / `--no-ai-correct` | AI 纠错开关 |
| `--ai-translate <lang>` | 翻译目标（空 = 关） |
| `--ai-base-url <url>` | OpenAI 兼容 BASE_URL |
| `--ai-model <id>` | 模型 id |
| `--ai-key <key>` | API 密钥（优先环境变量 `BARIBARI_AI_KEY`） |
| `--share` / `--share-port <n>` | 局域网共享主机 |
| `--join <url>` | 加入共享 |
| `--vad-threshold <n>` | Silero 语音概率阈值 |
| `--vad-min-silence <sec>` | 切分静音时长 |
| `--vad-min-speech <sec>` | 丢弃更短的突发 |
| `--vad-max-speech <sec>` | 强制切断长独白 |
| `--demo` | 等同 `baribari resume demo` |

## setup

```bash
baribari setup
baribari setup --download
baribari setup --download -y
baribari setup --skip-spk
baribari setup --models-dir D:/m
```

## 会话

```bash
baribari session list
baribari session path ses_m5abc
baribari session rm ses_完整id
baribari session rm ses_xxx -y
baribari session rm ses_ab --allow-prefix
baribari resume demo
baribari resume ses_m5abc
```

默认删除需要**完整会话 id**。仅在前缀唯一时使用 `--allow-prefix`。

## 示例

```bash
baribari --lang ja --ui-lang zh
baribari --source both -o meeting.txt
baribari --ai --ai-base-url https://api.openai.com/v1 --ai-translate en
baribari --share --share-port 8788
baribari join http://192.168.1.10:8787/
baribari --vad-min-silence 0.35 --spk-threshold 0.60
baribari --asr-engine reazonspeech-ja
```
