---
layout: home
title: baribari
titleTemplate: ターミナルで会議を文字起こし

hero:
  name: baribari
  text: 会議に集中。記録は残す。
  tagline: 会議の音声をターミナル上でリアルタイムに文字起こしします。ローカル認識、話者ラベル、任意の AI に対応し、保存したセッションはあとから再生、続行録音、翻訳、要約ができます。
  actions:
    - theme: brand
      text: はじめる
      link: https://github.com/QinYangWang/baribari/blob/main/README.ja.md#%E3%82%AF%E3%82%A4%E3%83%83%E3%82%AF%E3%82%B9%E3%82%BF%E3%83%BC%E3%83%88
    - theme: alt
      text: 仕組みを見る
      link: /ja/architecture
    - theme: alt
      text: npm で見る
      link: https://www.npmjs.com/package/baribari

features:
  - title: 会議中に字幕を確認
    details: 会議の進行に合わせて字幕が表示されます。聞き逃したときは履歴を遡って確認できるため、記憶や不完全なメモだけに頼る必要がありません。
    link: /ja/sessions
    linkText: セッションを見る
  - title: 音声認識はローカルで実行
    details: SenseVoice、Fun-ASR-Nano、ReazonSpeech、Silero VAD は自分の PC 上で動作するため、音声認識にクラウドへのアップロードは不要です。外部サービスを使うのは、任意の AI 機能を有効にした場合だけです。
    link: /ja/asr-pipeline
    linkText: ASR を見る
  - title: 発言者をラベル付け
    details: 声紋を使って話者を区別し、頻繁に会う人はグローバル名簿に保存できます。自動判定が違う場合は、統合、改名、手動割り当てで修正できます。
    link: /ja/speakers
    linkText: 話者を見る
  - title: 会議ごとに自動保存
    details: ライブ文字起こしを実行するたびに、字幕と任意の録音が一つのフォルダへ保存されます。あとから続行録音、翻訳、要約ができます。
    link: /ja/sessions
    linkText: 再生を見る
  - title: モデルを追加せずに共有
    details: 1 台の PC が文字起こしと LAN 配信を担当します。ほかの参加者は認識モデルをダウンロードせず、ブラウザや CLI から確定字幕を確認できます。
    link: /ja/architecture
    linkText: 設計を見る
  - title: ターミナル優先、UI は三言語
    details: ホスト向けフルスクリーン TUI。表示は英語・中国語・日本語を切り替え可能。認識言語とは独立している。
    link: /ja/tui-i18n
    linkText: TUI を見る
---
