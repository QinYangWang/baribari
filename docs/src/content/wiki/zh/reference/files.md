---
title: "文件与路径"
description: "Config, session, roster, and model file locations."
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["reference", "paths"]
isPinned: false
growthStage: "evergreen"
---
## 配置根目录

默认：`~/.config/baribari/`  
覆盖：`BARIBARI_CONFIG_DIR`

```text
~/.config/baribari/
├── config.json
├── replace.json
├── models/
├── sessions/<session-id>/
├── speakers/roster.json
└── recordings/
```

打印解析路径：

```bash
baribari paths
# 别名：baribari config
```

## 会话目录结构

```text
~/.config/baribari/sessions/<session-id>/
  meta.json
  transcript.jsonl
  speakers.json
  audio.wav           # 仅在开启录音 (r) 时
  audio-part-*.wav
```

会话 ID 形如 `ses_…`。显示名可在回放模式按 `e` 重命名。

## 全局说话人

```text
~/.config/baribari/speakers/roster.json
```

声纹**按嵌入模型**分别存储。详见 [说话人](/baribari/wiki/zh/use/speakers)。

## 本词典

```text
~/.config/baribari/replace.json
```

ASR 后的非 AI 替换。见 [配置说明](/baribari/wiki/zh/configure/configuration)。

## 发布本站

设计文档在 `docs/`，用 Veka (Astro) 构建：

```bash
npm run docs:dev
npm run docs:build
```

GitHub Pages：在存在 `.github/workflows/docs.yml` 后，于 **Settings → Pages → Source: GitHub Actions** 启用。

站点：`https://qinyangwang.github.io/baribari/zh/`
