# ASR パイプライン

## ライブ段階

1. **収録** → 16 kHz PCM  
2. **Silero VAD** → 発話区間  
3. **SenseVoice** → オフライン復号（`auto|zh|en|ja|ko|yue`）  
4. **話者 ID** → embedding + 複数窓投票  
5. **ターン結合** → 同一話者の短い final を任意結合  
6. **後処理** → `replace.json`  
7. **final 発行** → TUI / jsonl / LAN  
8. **AI**（任意）→ 校正・翻訳（訳は別フィールド）

復号中は live 行に「認識中…」と表示できます。これは進行状況を示すもので、仮の文字起こしを生成するものではありません。

## 字幕が遅れて感じる理由

SenseVoice は発話区間をまとめて処理するオフライン認識です。VAD が無音または最大時間によって区間を確定し、CPU で復号したあとに字幕が表示されます。AI を有効にしている場合は、その処理時間も加わります。

| レバー | Balanced | 会議向け |
|--------|----------|----------|
| min silence | 0.6s | 0.25–0.35s |
| max speech | 30s | 6–9s |
| プリセット | Balanced | **Meeting** |
| AI 翻訳 | off | 速度優先なら off |

## VAD プリセット

TUI の設定から `balanced`、`meeting`、`low latency`、`smooth`、`aggressive` を選択できます。`low latency` はモデルに合わせて調整され、SenseVoice は終了無音 `0.22秒`・最大区間 `8秒`、Fun-ASR-Nano は文脈を多く残すため `0.28秒`・`12秒` を使います。プリセットの個別値を変更すると、表示は `custom` になります。

## 同一話者ターン

`speakerTurn`：`maxGapSec` 1.4 · `maxTurnSec` 24 · `idleMs` 4000 · `maxChunks` 3（既定 on）。  
目的は、短い VAD 区間ごとではなく、まとまった**話の区切り**ごとに AI を 1 回だけ呼び出すことです。

## AI

OpenAI 互換 API。`--ai` / `--ai-correct` / `--ai-translate`。Provider プリセット対応。

## エンジン

| | 状態 |
|--|------|
| SenseVoice | **既定** |
| Fun-ASR-Nano | 中国語・英語・日本語 |
| ReazonSpeech | 日本語特化 Zipformer Transducer |
| Online zipformer / engine-cmd | ロードマップ |
