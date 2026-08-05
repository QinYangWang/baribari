---
title: "说话人"
description: "两类问题 问题 机制 谁 说了这段？ 说话人 识别 （声纹匹配） 何时 换人？ VAD 静音切段 +（未来）diarization / 变点 baribari 目前给每个 VAD 段标一个说话人 ID，不做段内重叠分离。 声纹模型 模型 文件 默认阈值 说明 ERes2Net large （推荐） "
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["use", "speakers"]
isPinned: false
growthStage: "budding"
---
## 两类问题

| 问题 | 机制 |
|------|------|
| **谁**说了这段？ | 说话人**识别**（声纹匹配） |
| **何时**换人？ | VAD 静音切段 +（未来）diarization / 变点 |

baribari 目前给每个 VAD 段标一个说话人 ID，不做段内重叠分离。

## 声纹模型

| 模型 | 文件 | 默认阈值 | 说明 |
|------|------|----------|------|
| **ERes2Net-large**（推荐） | `3dspeaker_speech_eres2net_large_sv_zh-cn_3dspeaker_16k.onnx`（约 111 MB） | **0.45** | 识别更稳；新安装/setup 默认 |
| **CAM++** | `3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx`（约 27 MB） | **0.55** | 更轻；未配置 `spkEngine` 时兼容旧行为 |

在 **设置 → 声纹模型**、`config.json` 的 `spkEngine`，或 `--spk-engine campplus|eres2net-large` 中选择。

缺失模型时与 ASR 相同：可前台（Y）/ 后台（B）下载。`--skip-spk` / `--no-spk` 可完全跳过。

**各模型默认阈值不同**，不要一律套用 0.55。

## 识别路径

1. 选定的 3D-Speaker ONNX（`SpeakerEmbeddingExtractor`）。
2. 每位说话人有限模板库（约 3–5 条），避免单一中心点漂移。
3. 长段多窗投票。
4. 短/弱音频不新建说话人；弱不匹配需连续确认才注册。
5. 全局身份仅在高置信时更新。
6. 仅在分数模糊带使用时间滞后，真实换人仍可切换。

## 全局名册（按模型）

路径：`~/.config/baribari/speakers/roster.json`。

- 版本 2：每条含 `model` 与 `embedding` / `embeddings[]`。
- 旧版 v1（无 model）安全迁移为 **CAM++**，不删数据。
- 启动时只播种**当前模型**且维度匹配的条目。
- 其他模型模板仍保留在磁盘上。

## 设计上的限制

无静音的 A→B 切换、重叠插话等场景仍可能标错；换声纹模型后需在新模型下重新积累/改名入库。

详见 [路线图](/baribari/wiki/zh/project/roadmap)。
