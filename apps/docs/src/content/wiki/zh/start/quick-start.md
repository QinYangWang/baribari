---
title: "快速开始"
description: "从安装和模型下载开始，运行 Demo 或首场会议，并掌握日常转录、保存与回放流程。"
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["start", "guide"]
isPinned: true
growthStage: "evergreen"
---
若尚未安装，请先看 [安装](/baribari/wiki/zh/start/install)。

## 第一次运行

```bash
baribari setup --download
baribari
```

首次启动时选择**界面语言**、**识别模型**和**声纹模型**。之后在能采集会议声音的设备上运行 `baribari` 即可。

## 不开会也能体验

```bash
baribari demo     # 内置示例会话
baribari doctor   # 检查音频与模型环境
```

`baribari demo` 等同于 `baribari resume demo`。

## 常用一行命令

```bash
baribari --lang ja --ui-lang zh
baribari --source both -o meeting.txt          # Windows 系统声+麦
baribari --ai --ai-translate en
baribari --share                               # 局域网主机，端口 8787
baribari join http://192.168.1.10:8787/
baribari session list
baribari resume ses_xxxx
```

## 实时 TUI 速查

| 键 | 作用 |
|----|------|
| `p` / `Space` | 暂停 / 继续听音 |
| `s` | 设置 |
| `r` | 切换录音到当前会话 |
| `Tab` | 说话人 ↔ 字幕焦点 |
| `h` | 切换局域网共享 |
| `q` | 退出 |

完整快捷键见 [实时转写](/baribari/wiki/zh/use/live) 与 [会话与回放](/baribari/wiki/zh/use/sessions)。

## 下一步

- [实时转写](/baribari/wiki/zh/use/live) — 日常采集
- [说话人](/baribari/wiki/zh/use/speakers) — 名册与声纹
- [配置说明](/baribari/wiki/zh/configure/configuration) — 配置文件、VAD、环境变量
- [CLI 参考](/baribari/wiki/zh/reference/cli) — 全部命令与参数
