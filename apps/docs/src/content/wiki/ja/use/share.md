---
title: "LAN 共有"
description: "確定字幕を LAN 内で共有し、ほかの端末からブラウザまたは join コマンドで会議を追跡します。"
createdAt: 2026-08-05
updatedAt: 2026-08-05
tags: ["use", "share"]
isPinned: false
growthStage: "evergreen"
---
1 台のホストが ASR を実行し、同じネットワークの参加者が**確定字幕**だけを追います。モデルのインストールは不要です。

![Web 共有ビュー](/baribari/screenshots/web-share.png)

## ホスト

```bash
baribari --share
# またはライブ / 再開 TUI 内で h
```

既定ポートは **8787**。変更は `--share-port`：

```bash
baribari --share --share-port 8788
```

ホスト側パネルにクリック可能な LAN URL（`host:port`）が表示されます。

## 参加者として参加

```bash
baribari join http://<lan-ip>:8787/
```

またはブラウザで URL を開きます。参加者はセグメントを受信するだけで、VAD/ASR は実行しません。

## 注意

- 共有されるのは**確定**セグメントのみ（「認識中…」ライブ行は含まない）。
- `h` で終了せずに共有を切り替え可能。
- 再開モードでも保存済み会議を閲覧しながら共有できます。
