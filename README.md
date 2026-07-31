# baribari

**English** | [中文](./README.zh.md) | [日本語](./README.ja.md)

Real-time meeting transcription CLI (SenseVoice + Silero VAD + speaker ID · AI correct/translate · LAN share).

Install once, run like `pi`. Config and models live under your user directory.

```bash
npm i -g baribari   # or: npm link (dev)
baribari            # first run guides model download
baribari setup      # check / install models
baribari paths      # print config & model paths
```

## Layout

Default (override with `BARIBARI_CONFIG_DIR`):

```
~/.config/baribari/
  config.json          # settings (ASR/UI lang, source, VAD, AI, share…)
  models/              # model files
  recordings/          # default recording directory
```

### Custom model paths

Edit `~/.config/baribari/config.json`:

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

Or:

```bash
baribari setup --models-dir D:/models/baribari
```

## Models (manual download)

Place under `~/.config/baribari/models/` (or your `modelsDir`):

| Component | File | Download |
|-----------|------|----------|
| VAD | `silero_vad.onnx` | https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx |
| ASR | `sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/` (`model.int8.onnx` + `tokens.txt`) | https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2 |
| Speaker | `3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx` | https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx |

Release pages:

- ASR/VAD: https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models  
- Speaker: https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models  

Auto download:

```bash
baribari setup --download
# skip speaker model:
baribari setup --download --skip-spk
```

## Usage

```bash
baribari                              # TUI; Win default mic+speaker
baribari --source loopback
baribari --lang zh -o meeting.txt
baribari --ui-lang en                 # UI language (zh|ja|en)
baribari --ai --ai-translate en
baribari --share                      # LAN share
baribari --join http://192.168.1.10:8787/
baribari --vad-min-silence 0.35       # snappier splits
```

### Main options

| Flag | Meaning |
|------|---------|
| `--lang` | ASR: `auto\|zh\|en\|ja\|ko\|yue` |
| `--ui-lang` | UI: `zh\|ja\|en` (also `BARIBARI_UI_LANG` / OS locale) |
| `--source` | `mic` / `loopback` / `both` |
| `--ai` / `--ai-translate` / `--ai-base-url` / `--ai-model` | AI correct/translate |
| `--share` / `--join` | LAN share / join |
| `--vad-threshold` / `--vad-min-speech` / `--vad-min-silence` / `--vad-max-speech` / `--vad-window` | VAD |
| `--record-dir` | Recording dir (default `~/.config/baribari/recordings`) |

API key: `BARIBARI_AI_KEY` or `OPENAI_API_KEY`.

### TUI

| Key | Action |
|-----|--------|
| `p` | Pause |
| `s` | Settings (VAD, AI, UI language, …) |
| `h` | Share |
| `r` | Record |
| `Tab` | Focus speakers / transcript |
| `q` | Quit |

Three-column layout: speakers · live transcript · device/record/share status.  
Runtime messages appear in a bar above the footer shortcuts.

## Development

```bash
git clone https://github.com/QinYangWang/baribari.git
cd baribari
npm install
npm run build
npm link          # global baribari → this repo
```

## Source map

```
src/
  index.ts           # CLI
  i18n/              # UI locales (zh/ja/en)
  setup.ts           # first-run / download
  paths.ts           # ~/.config/baribari
  settings.ts        # config.json
  ai.ts / share-*.ts
  audio-capture.ts / transcribe.ts / tui.ts
```

## Publish

Push a version tag matching `package.json` (GitHub Actions + npm Trusted Publishing):

```bash
# bump version in package.json, then:
git tag v1.2.0
git push origin v1.2.0
```
