# セッションと再開

## 自動保存

ライブ会議ごとに次が作られます。

```text
~/.config/baribari/sessions/<session-id>/
  meta.json
  transcript.jsonl     # 行ごとに確定 Segment JSON
  speakers.json
  audio.wav            # 録音 (r) / 続行+録音時
  audio-part-*.wav
```

セッション ID は `ses_…` 形式。表示名は ID と別で、TUI の `e` で変更できます。

## 安全な削除

- **削除**（`session rm`）: 既定は**完全 id** + 再入力確認。
- `-y` で確認スキップ。`--allow-prefix` はプレフィックスが一意なときのみ。
- パストラバーサル対策あり（`session.ts`）。

## CLI

```bash
baribari session list
baribari session path <id>
baribari session rm <full-id>
baribari session rm ses_xxx -y
baribari session rm ses_ab --allow-prefix
baribari resume [id]          # 既定 demo
baribari demo
```

## 再開モード

保存済みセッションを開き、タイムライン上で字幕を閲覧、録音再生、続行、AI、共有ができます。

![デモセッション: タイムライン、話者、原文と訳](/screenshots/demo-mode.png)

| キー | 動作 |
|------|------|
| `↑` `↓` | 前/次**セグメント**（再生ヘッド移動） |
| `←` `→` | タイムライン **−2s / +2s** |
| `Space` / `p` | 再生 / 一時停止（`ffplay` 優先） |
| `c` | 同一セッションへライブ**続行**（demo 不可） |
| `t` / `T` | **現在** / **未翻訳すべて**を翻訳（AI） |
| `m` | 会議**要約**（字幕フォーカス）/ 話者**マージ**（話者パネル） |
| `s` | 設定 |
| `e` | セッション名変更 |
| `h` | **LAN 共有**トグル |
| `q` | 終了 |

ライブ専用キー（`r`、`Tab`、`1–9`）は再開では**使いません**。

## 複数クリップ音声

- 互換な `audio-part-*.wav` + `audio.wav` → 形式一致時に**マージ**。
- それ以外は seek/再生用に 1 本のタイムラインへ**連結**。
- 続行 + 録音は可能なら `audio.wav` へ PCM **追記**。

## JSONL セグメント

確定セグメントのみ。典型フィールドは `start`、`end`、`text`、任意で `translation`、`corrected`、`spk` など。部分状態イベントはディスクに書きません。

## デモセッション

`resume demo` / `--demo` 用の内蔵合成会議。実ファイル不要。
