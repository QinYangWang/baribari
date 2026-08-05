# Models & AI

## Local ASR models

SenseVoice is the default. In the TUI open **Settings → Speech ASR → ASR model** and use `←` / `→` to cycle SenseVoice, Fun-ASR-Nano, and ReazonSpeech.

| Component | Role | How it arrives |
|-----------|------|----------------|
| **Silero VAD** | Speech segmentation | `baribari setup --download` |
| **SenseVoice** | Multilingual ASR (default) | same |
| **Fun-ASR-Nano** | Optional local ASR for zh / en / ja | downloaded when selected |
| **ReazonSpeech** | Compact Japanese-optimized Zipformer (~162 MB) | downloaded when selected |
| **3D-Speaker CAM++** | Speaker embeddings (lighter) | setup / Settings (`--skip-spk` to omit) |
| **3D-Speaker ERes2Net-large** | Speaker embeddings (recommended) | same |

If a model is not installed, baribari asks before downloading. You can wait or keep transcribing while it downloads in the background; the model switches only after the download succeeds.

```bash
baribari --asr-engine reazonspeech-ja
baribari --spk-engine eres2net-large
baribari --spk-threshold 0.60
```

### Manual download links

| File | URL |
|------|-----|
| `silero_vad.onnx` | [download](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx) |
| SenseVoice int8 archive | [download](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2) |
| Speaker CAM++ | [download](https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx) |
| Speaker ERes2Net-large | [download](https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_large_sv_zh-cn_3dspeaker_16k.onnx) |

Release pages: [asr-models](https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models) · [speaker models](https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models)

## Optional AI enhancement

Post-process via any **OpenAI-compatible** Chat Completions API (OpenAI, Gemini OpenAI endpoint, DeepSeek, Groq, OpenRouter, Ollama, …). No extra SDK.

```bash
export BARIBARI_AI_KEY=sk-...
baribari --ai --ai-translate en --ai-model gpt-4o-mini
```

In the TUI: **Settings → AI** — toggle, translate target, Provider presets, BASE_URL, API key (masked), model.

| Provider | BASE_URL | Example model |
|----------|----------|----------------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `google/gemini-2.0-flash-001` |
| Ollama (local) | `http://127.0.0.1:11434/v1` | `qwen2.5:7b` |
| Custom | edit BASE_URL manually | — |

```bash
baribari --ai --ai-translate en \
  --ai-base-url https://generativelanguage.googleapis.com/v1beta/openai \
  --ai-model gemini-2.0-flash \
  --ai-key "$GEMINI_API_KEY"
```

- **corrected** stays in the source language
- **translation** is a separate line (never replaces the original)

Also available: `--ai-correct` / `--no-ai-correct` independent of translate.

## Speaker defaults

Matching uses the selected embedding model and that model’s cosine threshold (defaults **0.55** CAM++ / **0.45** ERes2Net-large). Voiceprints are **per model**. Details: [Speakers](./speakers).
