# 模型与 AI

## 本地 ASR 模型

默认 SenseVoice。TUI 中打开 **设置 → 语音识别 → ASR 模型**，用 `←` / `→` 在 SenseVoice、Fun-ASR-Nano、ReazonSpeech 间切换。

| 组件 | 作用 | 获取方式 |
|------|------|----------|
| **Silero VAD** | 语音切分 | `baribari setup --download` |
| **SenseVoice** | 多语种 ASR（默认） | 同上 |
| **Fun-ASR-Nano** | 可选本地 ASR（中/英/日） | 选中时下载 |
| **ReazonSpeech** | 日语优化 Zipformer（约 162 MB） | 选中时下载 |
| **3D-Speaker CAM++** | 说话人嵌入（更轻） | setup / 设置（`--skip-spk` 可跳过） |
| **3D-Speaker ERes2Net-large** | 说话人嵌入（推荐） | 同上 |

模型未安装时会询问是否下载。可等待，也可在后台下载的同时继续转写；下载成功后才切换模型。

```bash
baribari --asr-engine reazonspeech-ja
baribari --spk-engine eres2net-large
baribari --spk-threshold 0.60
```

### 手动下载链接

| 文件 | URL |
|------|-----|
| `silero_vad.onnx` | [下载](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx) |
| SenseVoice int8 包 | [下载](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2) |
| 说话人 CAM++ | [下载](https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx) |
| 说话人 ERes2Net-large | [下载](https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_large_sv_zh-cn_3dspeaker_16k.onnx) |

发布页：[asr-models](https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models) · [speaker models](https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models)

## 可选 AI 增强

通过任意 **OpenAI 兼容** Chat Completions API 做后处理（OpenAI、Gemini OpenAI 端点、DeepSeek、Groq、OpenRouter、Ollama 等）。无需额外 SDK。

```bash
export BARIBARI_AI_KEY=sk-...
baribari --ai --ai-translate en --ai-model gpt-4o-mini
```

TUI：**设置 → AI** — 开关、翻译目标、提供方预设、BASE_URL、API 密钥（掩码）、模型。

| 提供方 | BASE_URL | 示例模型 |
|--------|----------|----------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `google/gemini-2.0-flash-001` |
| Ollama（本地） | `http://127.0.0.1:11434/v1` | `qwen2.5:7b` |
| 自定义 | 手动编辑 BASE_URL | — |

```bash
baribari --ai --ai-translate en \
  --ai-base-url https://generativelanguage.googleapis.com/v1beta/openai \
  --ai-model gemini-2.0-flash \
  --ai-key "$GEMINI_API_KEY"
```

- **纠错结果**保持源语言
- **译文**单独一行（从不覆盖原文）

另有独立开关：`--ai-correct` / `--no-ai-correct`。

## 说话人默认

匹配使用当前嵌入模型及其余弦阈值（默认 CAM++ **0.55** / ERes2Net-large **0.45**）。声纹**按模型**存储。详见 [说话人](./speakers)。
