---
title: "話者"
description: "話者識別モデルとしきい値を設定し、グローバル声紋名簿と会議中の名前変更、統合、割り当てを管理します。"
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["use", "speakers"]
isPinned: false
growthStage: "budding"
---
## 2 つの問題

| 問題 | 仕組み |
|------|--------|
| **誰**が話したか | 話者**識別**（埋め込み照合） |
| **いつ**交代したか | VAD 無音区切り +（将来）diarization / 変化点 |

baribari は各 VAD 区間に 1 つの話者 ID を付けます。区間内の重なり分離はライブ経路の対象外です。

## 埋め込みモデル

| モデル | ファイル | 既定閾値 | 説明 |
|--------|----------|----------|------|
| **ERes2Net-large**（推奨） | `3dspeaker_speech_eres2net_large_sv_zh-cn_3dspeaker_16k.onnx`（約 111 MB） | **0.45** | 識別が強い・新規 setup 既定 |
| **CAM++** | `3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx`（約 27 MB） | **0.55** | 軽量・`spkEngine` 未設定時の互換 |

**設定 → 話者モデル**、`config.json` の `spkEngine`、または `--spk-engine campplus|eres2net-large`。

未導入時は ASR と同様に Y（前面）/ B（背景）ダウンロード。`--skip-spk` / `--no-spk` で完全スキップ。

モデルごとにコサイン分布が異なるため、閾値 0.55 を盲信しないでください。

## 識別の流れ

1. 選択した 3D-Speaker ONNX。
2. 話者ごとの有界テンプレートバンク（約 3–5）。
3. 長区間の複数窓投票。
4. 短い/弱い音声では新規登録しない。弱い不一致は連続確認後に enroll。
5. グローバル枠は高信頼時のみ更新。
6. 曖昧帯のみヒステリシス（本当の交代は許可）。

## グローバル名簿（モデル別）

`~/.config/baribari/speakers/roster.json`

- v2: 各行に `model` と `embedding` / `embeddings[]`。
- 旧 v1 は **CAM++** として安全に移行（削除しない）。
- 起動時は**現在モデル**かつ次元一致の行だけを seed。
- 他モデルのテンプレはディスクに残る。

## 設計上の限界

無音なしの A→B、重なり割り込みなどは誤ラベルになり得ます。モデル切替後は新モデル側で再登録が必要です。

詳細: [roadmap](/baribari/wiki/ja/project/roadmap)。
