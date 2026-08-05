# 故障排查

## 快速检查

```bash
baribari doctor
baribari paths
baribari devices
baribari setup
```

`doctor` 会报告音频设备、模型是否齐全及常见环境问题。

## 没有字幕

1. 确认麦克风（Windows 上还有 loopback）已选中 — `baribari devices`，再用 `--device`。
2. 说话时长需超过 VAD 最短语音（默认约 0.4s），过短会被丢弃。
3. 若出字太慢，试 VAD 预设 **会议**，或降低 `--vad-min-silence`。
4. 检查是否暂停（`p` / `Space`）。

## 模型下载失败

- 重跑 `baribari setup --download`。
- 检查磁盘空间与访问 GitHub releases 的网络。
- 自定义目录：`baribari setup --models-dir /path/to/models`。
- 手动链接见 [模型与 AI](./models-ai)。

## 语言不对 / 乱码感

- 设置识别语言：`--lang zh|en|ja|ko|yue|auto`。
- 日语会议可试 `--asr-engine reazonspeech-ja`。
- 在 `replace.json` 加本地替换，再考虑开 AI 纠错。

## 说话人乱切或乱并

- 调整 `--spk-threshold`（各引擎默认不同）。
- 难场景优先 ERes2Net-large：`--spk-engine eres2net-large`。
- 在 TUI 中重命名与合并（`Tab`、`m`），让全局名册学习。
- 只要纯字幕可用 `--no-spk`。

## AI 不工作

- 确认 `--ai` 或设置中 AI 已开启。
- 设置 `BARIBARI_AI_KEY`（或 `OPENAI_API_KEY`）。
- BASE_URL 应指向 OpenAI 兼容根路径（如 `…/v1`）。
- 纠错与翻译是独立开关。

## 局域网同伴看不到内容

- 主机需开启共享（`--share` 或 `h`）。
- 同伴需要主机局域网 IP 与端口（默认 8787）。
- 只推送**最终**句 — 等一句说完。
- 防火墙可能拦截共享端口入站。

## 回放无法播音频

- 实时会议中需开过录音（`r`）。
- 优先系统 PATH 上的 `ffplay`；否则尝试内置 `ffmpeg` + 系统播放器。
- 多段音频在格式允许时会合并或串到一条时间轴。

## 仍未解决

- 提 issue：[github.com/QinYangWang/baribari/issues](https://github.com/QinYangWang/baribari/issues)
- 附上 `baribari -V`、操作系统与相关 `doctor` 输出（请打码密钥）。
