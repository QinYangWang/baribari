---
title: "ライブ文字起こし"
description: "マイクまたはシステム音声を選び、字幕の状態を理解し、TUI から文字起こし、録音、共有を操作します。"
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["use", "tui"]
isPinned: false
growthStage: "evergreen"
---
任意のディレクトリからライブ会議を開始します。

```bash
baribari
```

音声を取り込み、ローカル VAD + ASR を実行し、話者をラベル付けして、セッションを `~/.config/baribari/sessions/` に自動保存します。

![話者ラベル付きライブ文字起こし](/baribari/screenshots/live-transcription.png)

## ライブ TUI キー

| キー | 動作 |
|------|------|
| `p` / `Space` | 聴取の一時停止 / 再開 |
| `s` | 設定（スクロール可能なグループ） |
| `h` | LAN 共有トグル |
| `r` | 録音トグル → セッション `audio.wav` |
| `c` | 画面上の字幕をクリア（セッションファイルは削除しない） |
| `Tab` | 話者 ↔ 字幕フォーカス |
| `1`–`9` | 直前セグメントを話者 *N* に割り当て（話者リストフォーカス時） |
| `m` | 話者の**マージ**（話者リスト内） |
| `↑` `↓` / ホイール | 字幕スクロール（`g` = ライブ末尾へ） |
| `q` | 終了 |

**レイアウト：** 話者 · ライブ字幕 · デバイス / 録音 / 共有

## ライブ行と確定文

現在の VAD 区間を ASR がデコードしているあいだ、字幕列の下端に**更新可能なライブ行**が残ります（「認識中…」など。捏造トークンは出しません）。区間が終わるとその行は消え、**確定**行が履歴に追加されます。

セッションファイル、LAN 共有、AI 訂正/翻訳は**確定のみ**を使います。

## タイミング

字幕は**VAD が発話区間を終えたあと**に出ます。

| 設定 | 既定 | 効果 |
|------|------|------|
| 無音分割（`--vad-min-silence`） | **0.6s**（Balanced） | この長さ静か → 切って認識 |
| 最大発話（`--vad-max-speech`） | **30s** | 長い独白を強制切断 |
| 最小発話（`--vad-min-speech`） | **0.4s** | 短いノイズを破棄 |

複数話者の会議では Settings の VAD プリセット **Meeting**、または例: `--vad-min-silence 0.32 --vad-max-speech 9`。

## 設定グループ

ライブ TUI で `s`：

- 認識（言語、ASR モデル）
- AI（ON/OFF、翻訳先、プロバイダ、キー、モデル）
- 音声（ソース、デバイス）
- 共有
- VAD プリセットと微調整
- UI 言語

詳細は [設定](/baribari/wiki/ja/configure/configuration) と [モデルと AI](/baribari/wiki/ja/configure/models-ai)。

## よく使う起動オプション

```bash
baribari --lang ja --ui-lang en
baribari --source both -o meeting.txt
baribari --no-spk
baribari --record ./meeting.wav
baribari --ai --ai-translate en
baribari --share --share-port 8788
```

一覧は [CLI リファレンス](/baribari/wiki/ja/reference/cli)。
