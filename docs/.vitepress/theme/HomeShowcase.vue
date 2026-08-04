<script setup lang="ts">
import { computed } from "vue";
import { useData, withBase } from "vitepress";

const { lang } = useData();

const content = computed(() => {
  if (lang.value.startsWith("zh")) {
    return {
      kicker: "界面预览",
      title: "从实时语音到可共享的会议记录",
      intro: "设置识别参数、查看实时字幕、重新打开已保存的会话，并通过浏览器共享最终字幕。",
      items: [
        { image: "live-transcription.png", title: "实时转写", text: "会议进行时同步查看说话人和字幕。", alt: "实时转写界面，左侧显示说话人，右侧显示正在生成的日文字幕" },
        { image: "settings.png", title: "集中设置", text: "在一个面板中调整识别、AI、音频和界面选项。", alt: "设置面板，可调整界面语言、语音识别、AI 和音频选项" },
        { image: "demo-mode.png", title: "Demo 与回放", text: "沿时间轴查看说话人、原文和译文。", alt: "Demo 会话，包含时间轴、说话人标签、原文和译文" },
        { image: "web-share.png", title: "网页共享", text: "局域网内的其他人无需安装模型即可查看最终字幕。", alt: "浏览器中的共享会话，按说话人显示实时字幕和译文" },
      ],
    };
  }

  if (lang.value.startsWith("ja")) {
    return {
      kicker: "画面イメージ",
      title: "ライブ音声から共有できる会議記録まで",
      intro: "認識を設定し、会議中の字幕を確認し、保存済みセッションを再生して、確定字幕をブラウザで共有できます。",
      items: [
        { image: "live-transcription.png", title: "ライブ文字起こし", text: "会議の進行に合わせて話者と字幕を確認できます。", alt: "左側に話者、右側に認識中の日本語字幕を表示するライブ文字起こし画面" },
        { image: "settings.png", title: "設定", text: "認識、AI、音声、表示の設定を一つの画面で変更できます。", alt: "表示言語、音声認識、AI、録音を変更する設定パネル" },
        { image: "demo-mode.png", title: "Demo・再生", text: "話者ラベル、原文、翻訳をタイムラインに沿って確認できます。", alt: "タイムライン、話者ラベル、原文、翻訳を表示する Demo セッション" },
        { image: "web-share.png", title: "Web 共有", text: "LAN 上の参加者はモデルを追加せずに確定字幕を確認できます。", alt: "話者別の確定字幕と翻訳を表示するブラウザ共有画面" },
      ],
    };
  }

  return {
    kicker: "Product tour",
    title: "From live audio to a shared record",
    intro: "Configure recognition, follow the meeting, reopen a saved session, and share finalized captions in a browser.",
    items: [
      { image: "live-transcription.png", title: "Live transcription", text: "Follow speakers and captions as the meeting happens.", alt: "Live transcription view with a speaker list and incoming Japanese transcript" },
      { image: "settings.png", title: "Settings", text: "Adjust recognition, AI, audio, and interface options in one place.", alt: "Settings panel for interface language, speech recognition, AI, and audio" },
      { image: "demo-mode.png", title: "Demo and resume", text: "Review a timeline with speaker labels, source text, and translations.", alt: "Demo session with timeline, speaker labels, original text, and translations" },
      { image: "web-share.png", title: "Web sharing", text: "Let people on the LAN follow finalized captions without installing models.", alt: "Browser view of a shared session with speaker-labelled captions and translations" },
    ],
  };
});
</script>

<template>
  <section class="bb-showcase" aria-labelledby="bb-showcase-title">
    <div class="bb-showcase-heading">
      <p class="bb-showcase-kicker">{{ content.kicker }}</p>
      <h2 id="bb-showcase-title">{{ content.title }}</h2>
      <p>{{ content.intro }}</p>
    </div>
    <div class="bb-showcase-grid">
      <figure
        v-for="(item, index) in content.items"
        :key="item.image"
        class="bb-showcase-card"
        :class="{ 'bb-showcase-card-wide': index === 0 || index === 3 }"
      >
        <img
          :src="withBase(`/screenshots/${item.image}`)"
          :alt="item.alt"
          loading="lazy"
        >
        <figcaption>
          <strong>{{ item.title }}</strong>
          <span>{{ item.text }}</span>
        </figcaption>
      </figure>
    </div>
  </section>
</template>
