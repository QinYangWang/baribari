---
title: "クイックスタート"
description: "First meeting, demo mode, and the day-to-day loop."
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["start", "guide"]
isPinned: true
growthStage: "evergreen"
---
未インストールの場合は先に [インストール](/baribari/wiki/ja/start/install) を参照してください。

## 初回起動

```bash
baribari setup --download
baribari
```

初回は**UI 言語**、**ASR モデル**、**話者モデル**を選びます。あとは会議音声が取れる場所で `baribari` を実行します。

## ライブ会議なしで試す

```bash
baribari demo     # 内蔵サンプルセッション
baribari doctor   # 音声とモデル環境の診断
```

`baribari demo` は `baribari resume demo` と同じです。

## 便利な一行

```bash
baribari --lang ja --ui-lang en
baribari --source both -o meeting.txt          # Windows loopback+mic
baribari --ai --ai-translate en
baribari --share                               # LAN ホスト、ポート 8787
baribari join http://192.168.1.10:8787/
baribari session list
baribari resume ses_xxxx
```

## ライブ TUI 早見

| キー | 動作 |
|------|------|
| `p` / `Space` | 聴取の一時停止 / 再開 |
| `s` | 設定 |
| `r` | セッションへの録音トグル |
| `Tab` | 話者 ↔ 字幕フォーカス |
| `h` | LAN 共有トグル |
| `q` | 終了 |

詳細は [ライブ文字起こし](/baribari/wiki/ja/use/live) と [セッションと再開](/baribari/wiki/ja/use/sessions)。

## 次へ

- [ライブ文字起こし](/baribari/wiki/ja/use/live) — 日常の収録
- [話者](/baribari/wiki/ja/use/speakers) — 名簿と声紋
- [設定](/baribari/wiki/ja/configure/configuration) — 設定ファイル、VAD、環境変数
- [CLI リファレンス](/baribari/wiki/ja/reference/cli) — 全コマンドとフラグ
