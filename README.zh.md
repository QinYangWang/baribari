# baribari

[English](./README.md) | **中文** | [日本語](./README.ja.md)

会议实时转录 CLI（SenseVoice + Silero VAD + 声纹 · AI 纠错/翻译 · 局域网共享）。

类似 `pi`：安装后直接执行；配置与模型在用户目录。

```bash
npm i -g baribari   # 或: npm link（开发）
baribari            # 首次运行会引导下载模型
baribari setup      # 检查 / 安装模型
baribari paths      # 打印配置与模型路径
```

## 目录布局

默认（可用环境变量 `BARIBARI_CONFIG_DIR` 覆盖）：

```
~/.config/baribari/
  config.json          # 设置（识别/界面语言、音源、VAD、AI、共享…）
  models/              # 模型文件
  recordings/          # 默认录音目录
```

### 自定义模型路径

编辑 `~/.config/baribari/config.json`：

```json
{
  "modelsDir": "D:/models/baribari",
  "models": {
    "vad": "D:/models/silero_vad.onnx",
    "senseVoiceDir": "D:/models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17",
    "spk": "D:/models/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx"
  }
}
```

或：

```bash
baribari setup --models-dir D:/models/baribari
```

## 模型（手动下载地址）

放到 `~/.config/baribari/models/`（或你配置的 `modelsDir`）：

| 组件 | 文件 | 下载 |
|------|------|------|
| VAD | `silero_vad.onnx` | https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx |
| ASR | `sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/`（内含 `model.int8.onnx` + `tokens.txt`） | https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2 |
| 声纹 | `3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx` | https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx |

发布页：

- ASR/VAD: https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models  
- 声纹: https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models  

自动下载：

```bash
baribari setup --download
# 不要声纹:
baribari setup --download --skip-spk
```

## 用法

```bash
baribari                              # TUI，Win 默认麦+扬声器
baribari --source loopback
baribari --lang zh -o meeting.txt
baribari --ui-lang zh                 # 界面语言 zh|ja|en
baribari --ai --ai-translate en
baribari --share                      # 局域网共享
baribari --join http://192.168.1.10:8787/
baribari --vad-min-silence 0.35       # 更碎切段
```

### 主要参数

| 参数 | 含义 |
|------|------|
| `--lang` | 识别语言 `auto\|zh\|en\|ja\|ko\|yue` |
| `--ui-lang` | 界面语言 `zh\|ja\|en`（也可用 `BARIBARI_UI_LANG` / 系统语言） |
| `--source` | `mic` / `loopback` / `both` |
| `--ai` / `--ai-translate` / `--ai-base-url` / `--ai-model` | AI 纠错/翻译 |
| `--share` / `--join` | 局域网共享 / 加入 |
| `--vad-threshold` / `--vad-min-speech` / `--vad-min-silence` / `--vad-max-speech` / `--vad-window` | VAD 切段 |
| `--record-dir` | 录音目录（默认 `~/.config/baribari/recordings`） |

API Key：`BARIBARI_AI_KEY` 或 `OPENAI_API_KEY`。

### TUI

| 键 | 作用 |
|----|------|
| `p` | 暂停 |
| `s` | 设置（VAD、AI、界面语言等） |
| `h` | 共享 |
| `r` | 录音 |
| `Tab` | 切换说话人 / 转写区焦点 |
| `q` | 退出 |

三栏布局：说话人 · 实时转写 · 设备/录音/共享状态。  
运行时提示显示在底部快捷键上方的消息条中。

## 开发

```bash
git clone https://github.com/QinYangWang/baribari.git
cd baribari
npm install
npm run build
npm link          # 全局 baribari 指向本仓库
```

## 源码

```
src/
  index.ts           # CLI
  i18n/              # 界面文案 zh/ja/en
  setup.ts           # 首次引导 / 下载
  paths.ts           # ~/.config/baribari
  settings.ts        # config.json
  ai.ts / share-*.ts
  audio-capture.ts / transcribe.ts / tui.ts
```

## 发布

推送与 `package.json` 版本一致的 tag（GitHub Actions + npm Trusted Publishing）：

```bash
git tag v1.2.0
git push origin v1.2.0
```
