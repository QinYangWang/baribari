# 会话与回放

## 自动保存

```text
~/.config/baribari/sessions/<session-id>/
  meta.json
  transcript.jsonl    # 仅 final
  speakers.json
  audio.wav / audio-part-*.wav
```

会话 ID 的格式为 `ses_…`；在 TUI 中按 `e` 可以修改会话的显示名称。

## 安全删除

- 默认必须提供**完整的会话 ID**，并再次输入以确认。  
- `-y` 可跳过确认；只有当前缀唯一时，才能使用 `--allow-prefix` 按前缀删除。  
- `session.ts` 会检查路径，避免通过路径穿越删除会话目录之外的文件。  

## CLI

```bash
baribari session list
baribari session path <id>
baribari session rm <full-id>
baribari resume [id]
baribari demo
```

## Resume 模式

Resume 模式用于沿时间轴浏览字幕、播放可选录音，以及继续处理已有会话。它的快捷键与实时转写模式不同：`↑` `↓` 切换字幕段，`←` `→` 调整播放位置，`Space` / `p` 播放或暂停，`c` 续录，`t` / `T` 翻译，`m` 总结或合并说话人，`e` 改名，`h` 共享，`q` 退出。

![Demo 会话，包含时间轴、说话人标签、原文和译文](/screenshots/demo-mode.png)

播放音频时优先使用 `ffplay`；如果不可用，则尝试 `ffmpeg-static` 和系统播放器。程序会尽量合并多段音频，无法合并时则在同一时间轴上连续播放。按 `c` 会在**当前会话**中继续录制，demo 会话除外。

## 多段音频

格式一致时，程序会合并多段音频；格式不一致时，则按顺序连接播放。续录产生的音频会尽量**追加**到 `audio.wav`。

## jsonl

JSONL 文件只保存最终字幕（final），包含 `start`、`end`、`text` 字段，以及可选的 `translation`、`corrected`、`spk` 字段。临时状态（partial）不会写入文件。

## Demo

内置样例：`resume demo` / `--demo`。
