---
title: ロードマップ
description: baribari が現在、次、その後、ラボで取り組むこと
aside: false
---

# ロードマップ

<div class="roadmap-hero">
  <span class="roadmap-eyebrow">ローカル優先 · オープンソース · セルフホスト</span>
  <p class="roadmap-lead">音声の主導権を手放さず、会話を共有・再訪・活用できる理解へ変えていきます。</p>
  <p>このボードは優先度を示すもので、リリース日を約束するものではありません。安定性と実測品質を確認してから次へ進みます。</p>
</div>

::: tip 現在の重点
長時間会議を継続・復旧可能にし、その土台で日本語字幕と話者識別を改善します。
:::

<div class="roadmap-board">
  <section class="roadmap-column is-now">
    <header class="roadmap-column-header"><span class="roadmap-column-title">現在</span><span class="roadmap-count">2</span></header>
    <article class="roadmap-task"><span class="roadmap-label">安定性</span><h3>止まらない会議</h3><p>モデル、音声、端末の障害から進行中の会議を守ります。</p><ul><li>録音をストリーム保存し全キューを制限</li><li>状態を原子的に書き、未完了セッションを復旧</li><li>モデル取得の再開・検証・再試行</li><li>数時間の収録と継続を負荷試験</li></ul></article>
    <article class="roadmap-task"><span class="roadmap-label">品質</span><h3>信頼できる共通ベンチマーク</h3><p>調整や主張の前に、再現可能な測定を行います。</p><ul><li>SenseVoice、Fun-ASR-Nano、ReazonSpeech を比較</li><li>高速な日本語、話者交替、雑音、遠距離音声を収録</li><li>誤り率、確定遅延、メモリ、CPU を追跡</li></ul></article>
  </section>

  <section class="roadmap-column is-next">
    <header class="roadmap-column-header"><span class="roadmap-column-title">次</span><span class="roadmap-count">2</span></header>
    <article class="roadmap-task"><span class="roadmap-label">字幕</span><h3>発話をより早く理解する</h3><p>文を細切れにせず、信頼できる字幕までの待ち時間を短縮します。</p><ul><li>モデル別 VAD と確定処理を調整</li><li>人名・専門語のホットワード</li><li>ストリーミング下書き + オフライン確定を評価</li><li>online Zipformer の部分字幕を検証</li></ul></article>
    <article class="roadmap-task"><span class="roadmap-label">話者</span><h3>誰が話しているか覚える</h3><p>自信のある誤認より、正直な「不確か」を優先します。</p><ul><li>複数ウィンドウの声紋投票</li><li>長い区間内の話者交替を検出</li><li>不確か・混在・分割・再照合フロー</li><li>任意の会議後 diarization</li></ul></article>
  </section>

  <section class="roadmap-column is-later">
    <header class="roadmap-column-header"><span class="roadmap-column-title">その後</span><span class="roadmap-count">2</span></header>
    <article class="roadmap-task"><span class="roadmap-label">知識</span><h3>再利用できる会議記録</h3><p>文字起こしファイルを、永続的で検索可能な文脈へ進化させます。</p><ul><li>全文検索から該当時刻へ移動</li><li>原文と訳を残した編集</li><li>SRT、VTT、Markdown、JSON 出力</li><li>一括取込と選択区間の再処理</li></ul></article>
    <article class="roadmap-task"><span class="roadmap-label">セルフホスト</span><h3>1 つの音声エンジンを複数人で</h3><p>1 台が収録・推論し、チームはブラウザから追跡します。</p><ul><li><code>baribari serve</code> とバージョン付きイベント</li><li>カーソル再接続とメッセージ重複排除</li><li>トークン、API、Webhook、最小管理 UI</li><li>Docker、systemd、LAN 配備ガイド</li></ul></article>
  </section>

  <section class="roadmap-column is-lab">
    <header class="roadmap-column-header"><span class="roadmap-column-title">ラボ</span><span class="roadmap-count">2</span></header>
    <article class="roadmap-task"><span class="roadmap-label">音声</span><h3>言語を越えて話す</h3><p>利用者の制御を保ったまま、翻訳を音声へ変える方法を探ります。</p><ul><li>翻訳 → TTS → 仮想マイク</li><li>遅延、中断、エコー制御を測定</li><li>近い将来の音声クローンは対象外</li></ul></article>
    <article class="roadmap-task"><span class="roadmap-label">学習</span><h3>フィードバック付き会話練習</h3><p>ローカル音声基盤で有用なコーチングが可能か検証します。</p><ul><li>音素アラインメントと発音評価</li><li>アクセント、リズム、ピッチ、文法</li><li>任意の常時手前字幕ウィンドウ</li></ul></article>
  </section>
</div>

## プラットフォーム基盤

全カードは安定したエンジン層に依存します。ASR・話者・翻訳・TTS の共通インターフェース、検証可能なモデルカタログ、バージョン付き字幕イベント API、回帰テストに入る性能・品質ベンチマークを整備します。

## 近く予定しないもの

<div class="roadmap-not-doing"><span>モバイルクライアント</span><span>商用 SaaS と課金</span><span>クラウドのみの既定</span><span>完全なビデオ会議</span><span>近い将来の音声クローン</span><span>分離モデルなしの完全な重複音声分離</span></div>

## コントリビュート

- 範囲の明確なカードを選び、大きな実装の前に issue を作成
- モデルにはライセンス、入手元、ベンチマーク、再現サンプルを添付
- 品質報告には言語、音声環境、モデル、期待結果を記載
- 寄付はモデル配布、CI、署名、試験機材を支援し、機能は常にオープン
