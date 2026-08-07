---
title: "トラブルシューティング"
description: "doctor、paths、devices、setup を使い、音声デバイス、モデル取得、認識、端末表示の問題を切り分けます。"
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["help"]
isPinned: false
growthStage: "evergreen"
---
## まず確認

```bash
baribari doctor
baribari paths
baribari devices
baribari setup
```

`doctor` は音声デバイス、モデル有無、よくある環境問題を報告します。

## 字幕が出ない

1. マイク（Windows では loopback も）が選ばれているか — `baribari devices`、続けて `--device`。
2. VAD 最小発話（既定約 0.4s）より短い発話は破棄されます。
3. 出が遅い場合は VAD プリセット **Meeting**、または `--vad-min-silence` を下げる。
4. 一時停止していないか（`p` / `Space`）。

## モデル取得に失敗

- `baribari setup --download` を再実行。
- ディスク容量と GitHub releases への到達性を確認。
- カスタム root: `baribari setup --models-dir /path/to/models`。
- 手動 URL は [モデルと AI](/baribari/wiki/ja/configure/models-ai)。

## 言語が違う / 崩れた文字

- ASR 言語: `--lang zh|en|ja|ko|yue|auto`。
- 日本語中心なら `--asr-engine reazonspeech-ja`。
- 先に `replace.json` でローカル修正し、必要なら AI 訂正。

## 話者の分割・結合がおかしい

- `--spk-threshold` を上げ下げ（エンジンで既定が異なる）。
- 難しい部屋は ERes2Net-large: `--spk-engine eres2net-large`。
- TUI で改名・マージ（`Tab`、`m`）し名簿を学習させる。
- 字幕だけなら `--no-spk`。

## AI が動かない

- `--ai` または Settings → AI が ON か。
- `BARIBARI_AI_KEY`（または `OPENAI_API_KEY`）を設定。
- BASE_URL は OpenAI 互換 root（例: `…/v1`）まで。
- 訂正と翻訳は独立したスイッチ。

## LAN 共有で相手に何も見えない

- ホスト側で共有 ON（`--share` または `h`）。
- 参加者はホストの LAN IP とポート（既定 8787）が必要。
- **確定**セグメントだけが流れる — 発話完了を待つ。
- ファイアウォールが入方向を塞いでいないか。

## 再開で音声が再生できない

- ライブ中に録音（`r`）が有効だった必要あり。
- PATH 上の `ffplay` を優先。なければ同梱 `ffmpeg` + OS プレイヤー。
- 複数クリップは形式が許せばマージまたは 1 本のタイムラインに連結。

## まだ解決しない

- Issue: [github.com/QinYangWang/baribari/issues](https://github.com/QinYangWang/baribari/issues)
- `baribari -V`、OS、関連する `doctor` 出力を添付（キーは伏せる）。
