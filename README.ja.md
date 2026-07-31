# baribari

[English](./README.md) | [中文](./README.zh.md) | **日本語**

会議リアルタイム文字起こし CLI（SenseVoice + Silero VAD + 話者識別 · AI 校正/翻訳 · LAN 共有）。

`pi` のようにインストール後すぐ実行。設定とモデルはユーザーディレクトリに置きます。

```bash
npm i -g baribari   # または: npm link（開発）
baribari            # 初回はモデル導入ガイド
baribari setup      # モデル確認 / インストール
baribari paths      # 設定とモデルパスを表示
```

## ディレクトリ構成

既定（環境変数 `BARIBARI_CONFIG_DIR` で上書き可）：

```
~/.config/baribari/
  config.json          # 設定（認識/表示言語、音源、VAD、AI、共有…）
  models/              # モデル
  recordings/          # 既定の録音ディレクトリ
```

### モデルパスのカスタム

`~/.config/baribari/config.json` を編集：

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

または：

```bash
baribari setup --models-dir D:/models/baribari
```

## モデル（手動ダウンロード）

`~/.config/baribari/models/`（または `modelsDir`）へ配置：

| コンポーネント | ファイル | ダウンロード |
|----------------|----------|--------------|
| VAD | `silero_vad.onnx` | https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx |
| ASR | `sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/`（`model.int8.onnx` + `tokens.txt`） | https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2 |
| 声紋 | `3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx` | https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx |

リリースページ：

- ASR/VAD: https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models  
- 声紋: https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models  

自動ダウンロード：

```bash
baribari setup --download
# 声紋なし:
baribari setup --download --skip-spk
```

## 使い方

```bash
baribari                              # TUI。Win 既定はマイク+スピーカー
baribari --source loopback
baribari --lang ja -o meeting.txt
baribari --ui-lang ja                 # 表示言語 zh|ja|en
baribari --ai --ai-translate en
baribari --share                      # LAN 共有
baribari --join http://192.168.1.10:8787/
baribari --vad-min-silence 0.35       # より細かく分割
```

### 主なオプション

| フラグ | 意味 |
|--------|------|
| `--lang` | 認識言語 `auto\|zh\|en\|ja\|ko\|yue` |
| `--ui-lang` | 表示言語 `zh\|ja\|en`（`BARIBARI_UI_LANG` / OS ロケールも可） |
| `--source` | `mic` / `loopback` / `both` |
| `--ai` / `--ai-translate` / `--ai-base-url` / `--ai-model` | AI 校正/翻訳 |
| `--share` / `--join` | LAN 共有 / 参加 |
| `--vad-threshold` / `--vad-min-speech` / `--vad-min-silence` / `--vad-max-speech` / `--vad-window` | VAD |
| `--record-dir` | 録音ディレクトリ（既定 `~/.config/baribari/recordings`） |

API Key：`BARIBARI_AI_KEY` または `OPENAI_API_KEY`。

### TUI

| キー | 動作 |
|------|------|
| `p` | 一時停止 |
| `s` | 設定（VAD、AI、表示言語など） |
| `h` | 共有 |
| `r` | 録音 |
| `Tab` | 話者 / 転写フォーカス切替 |
| `q` | 終了 |

3 カラム：話者 · リアルタイム転写 · デバイス/録音/共有状態。  
実行時メッセージはフッターショートカット上のバーに表示されます。

## 開発

```bash
git clone https://github.com/QinYangWang/baribari.git
cd baribari
npm install
npm run build
npm link          # グローバル baribari → このリポジトリ
```

## ソース構成

```
src/
  index.ts           # CLI
  i18n/              # UI 文言 zh/ja/en
  setup.ts           # 初回ガイド / ダウンロード
  paths.ts           # ~/.config/baribari
  settings.ts        # config.json
  ai.ts / share-*.ts
  audio-capture.ts / transcribe.ts / tui.ts
```

## 公開

`package.json` と同じバージョンの tag を push（GitHub Actions + npm Trusted Publishing）：

```bash
git tag v1.2.0
git push origin v1.2.0
```
