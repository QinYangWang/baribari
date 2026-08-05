# 会话与回放

## 自动保存

每次实时会议会创建：

```text
~/.config/baribari/sessions/<session-id>/
  meta.json
  transcript.jsonl     # 每行一条最终 Segment JSON
  speakers.json
  audio.wav            # 开启录音 (r) / 续录+录音时
  audio-part-*.wav
```

会话 ID 形如 `ses_…`。显示名与 ID 分离，可在 TUI 按 `e` 修改。

## 安全删除

- **删除**（`session rm`）：默认需要**完整 id** + 再次输入确认。
- `-y` 跳过确认；`--allow-prefix` 仅在前缀唯一时可用。
- 路径处理防止目录穿越（`session.ts`）。

## CLI

```bash
baribari session list
baribari session path <id>
baribari session rm <完整id>
baribari session rm ses_xxx -y
baribari session rm ses_ab --allow-prefix
baribari resume [id]          # 默认 demo
baribari demo
```

## 回放模式

打开已保存会话，而不是新开实时会议。可在时间轴上浏览字幕、播放录音、续录、跑 AI 工具或共享。

![Demo 会话：时间轴、说话人、原文与译文](/screenshots/demo-mode.png)

| 键 | 作用 |
|----|------|
| `↑` `↓` | 上/下一条字幕（播放头跟随） |
| `←` `→` | 时间轴 −2s / +2s |
| `Space` / `p` | 播放/暂停（优先 `ffplay`） |
| `c` | 在同一会话中**继续录制**（demo 不支持） |
| `t` / `T` | 翻译当前 / 翻译所有缺失 |
| `m` | 会议总结（字幕区）/ **合并**说话人（说话人栏） |
| `s` | 设置 |
| `e` | 重命名会话 |
| `h` | 切换局域网共享 |
| `q` | 退出 |

实时专用键（`r`、`Tab`、`1–9`）在回放中**不可用**。

## 多段音频

- 格式一致的 `audio-part-*.wav` + `audio.wav` → **合并**。
- 否则在一条时间轴上**串接**以便 seek/播放。
- 续录 + 录音在可能时**追加** PCM 到 `audio.wav`。

## JSONL 片段

只写最终段。常见字段：`start`、`end`、`text`，以及可选的 `translation`、`corrected`、`spk` 等。部分状态事件从不落盘。

## Demo 会话

内置示例会议，供 `resume demo` / `--demo` 使用，无需真实文件。
