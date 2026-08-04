# セッションと再生

## 自動保存

```text
~/.config/baribari/sessions/<id>/
  meta.json · transcript.jsonl · speakers.json · audio*.wav
```

セッション ID は `ses_…` という形式です。表示名は ID とは別に管理され、TUI で `e` を押すと変更できます。

## 削除の安全

既定では完全なセッション ID を指定し、同じ ID を再入力して削除を確認します。`-y` で確認を省略でき、`--allow-prefix` は前方一致が一つだけの場合に使用できます。セッション外のファイルを削除しないよう、パストラバーサルも検査します。

## CLI

`session list|path|rm` · `resume` · `demo`

## Resume

Resume モードでは、保存済みの字幕をタイムラインで閲覧し、録音を再生したり各種ツールを実行したりできます。キー操作はライブ文字起こしと異なります（`↑` `↓`、`←` `→`、`Space` / `p`、`c`、`t` / `T`、`m`、`e`、`h`、`q`）。

![タイムライン、話者ラベル、原文、翻訳を表示する Demo セッション](/screenshots/demo-mode.png)

音声の再生には `ffplay` を優先して使用します。複数の音声ファイルは、形式が同じなら結合し、異なる場合は一つのタイムライン上で順に扱います。demo 以外では、`c` を押すと同じセッションで録音を続けられます。

## jsonl

JSONL ファイルには確定した字幕（**final**）だけを保存します。認識中の状態（partial）はディスクに書き込みません。

## Demo

`resume demo` / `--demo`
