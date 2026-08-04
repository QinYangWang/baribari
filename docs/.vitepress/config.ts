import { defineConfig } from "vitepress";

// Project Pages: https://<user>.github.io/baribari/
const base = process.env.DOCS_BASE || "/baribari/";

function side(prefix: string, t: {
  design: string;
  overview: string;
  architecture: string;
  asr: string;
  speakers: string;
  sessions: string;
  tui: string;
  roadmap: string;
  ops: string;
  pages: string;
}) {
  const p = prefix === "/" ? "" : prefix;
  return [
    {
      text: t.design,
      collapsed: false,
      items: [
        { text: t.overview, link: `${p}/` },
        { text: t.architecture, link: `${p}/architecture` },
        { text: t.asr, link: `${p}/asr-pipeline` },
        { text: t.speakers, link: `${p}/speakers` },
        { text: t.sessions, link: `${p}/sessions` },
        { text: t.tui, link: `${p}/tui-i18n` },
        { text: t.roadmap, link: `${p}/roadmap` },
      ],
    },
    {
      text: t.ops,
      collapsed: false,
      items: [{ text: t.pages, link: `${p}/github-pages` }],
    },
  ];
}

function nav(prefix: string, t: {
  home: string;
  design: string;
  architecture: string;
  asr: string;
  speakers: string;
  sessions: string;
  tui: string;
  roadmap: string;
  pages: string;
}) {
  const p = prefix === "/" ? "" : prefix;
  return [
    { text: t.home, link: `${p}/` },
    {
      text: t.design,
      items: [
        { text: t.architecture, link: `${p}/architecture` },
        { text: t.asr, link: `${p}/asr-pipeline` },
        { text: t.speakers, link: `${p}/speakers` },
        { text: t.sessions, link: `${p}/sessions` },
        { text: t.tui, link: `${p}/tui-i18n` },
        { text: t.roadmap, link: `${p}/roadmap` },
      ],
    },
    {
      text: "GitHub",
      link: "https://github.com/QinYangWang/baribari",
    },
  ];
}

export default defineConfig({
  title: "baribari",
  description:
    "Local-first meeting transcription in the terminal — design docs",
  base,
  cleanUrls: true,
  ignoreDeadLinks: true,
  lastUpdated: true,
  appearance: "dark",
  head: [
    [
      "link",
      { rel: "icon", href: `${base}favicon.svg`, type: "image/svg+xml" },
    ],
    ["meta", { name: "theme-color", content: "#bd93f9" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "baribari" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Real-time meeting transcription CLI — local ASR, speakers, sessions, AI, LAN share.",
      },
    ],
  ],
  themeConfig: {
    // Text only — no image logo
    siteTitle: "baribari",
    logo: undefined,
    socialLinks: [
      { icon: "github", link: "https://github.com/QinYangWang/baribari" },
      { icon: "npm", link: "https://www.npmjs.com/package/baribari" },
    ],
    search: {
      provider: "local",
      options: { detailedView: true },
    },
  },
  locales: {
    root: {
      label: "English",
      lang: "en",
      link: "/",
      title: "baribari",
      description:
        "Local-first meeting transcription in the terminal — design docs",
      themeConfig: {
        siteTitle: "baribari",
        outline: { level: [2, 3], label: "On this page" },
        nav: nav("/", {
          home: "Home",
          design: "Design",
          architecture: "Architecture",
          asr: "ASR pipeline",
          speakers: "Speakers",
          sessions: "Sessions",
          tui: "TUI & i18n",
          roadmap: "Roadmap",
          pages: "GitHub Pages",
        }),
        sidebar: side("/", {
          design: "Design",
          overview: "Home",
          architecture: "Architecture",
          asr: "ASR pipeline",
          speakers: "Speakers",
          sessions: "Sessions & resume",
          tui: "TUI & i18n",
          roadmap: "Roadmap",
          ops: "Ops",
          pages: "GitHub Pages",
        }),
        editLink: {
          pattern:
            "https://github.com/QinYangWang/baribari/edit/main/docs/:path",
          text: "Edit this page",
        },
        lastUpdated: {
          text: "Updated",
          formatOptions: { dateStyle: "medium" },
        },
        docFooter: { prev: "Previous", next: "Next" },
        returnToTopLabel: "Back to top",
        sidebarMenuLabel: "Menu",
        darkModeSwitchLabel: "Appearance",
        lightModeSwitchTitle: "Switch to light",
        darkModeSwitchTitle: "Switch to dark",
        footer: {
          message:
            'MIT · <a href="https://github.com/QinYangWang/baribari">GitHub</a>',
          copyright: "© baribari contributors",
        },
      },
    },
    zh: {
      label: "中文",
      lang: "zh-CN",
      link: "/zh/",
      title: "baribari",
      description: "终端里的本地优先会议实时转写 — 设计文档",
      themeConfig: {
        siteTitle: "baribari",
        outline: { level: [2, 3], label: "本页目录" },
        nav: nav("/zh", {
          home: "首页",
          design: "设计",
          architecture: "架构",
          asr: "识别管线",
          speakers: "说话人",
          sessions: "会话",
          tui: "TUI 与多语言",
          roadmap: "路线图",
          pages: "GitHub Pages",
        }),
        sidebar: side("/zh", {
          design: "设计",
          overview: "首页",
          architecture: "架构",
          asr: "识别管线",
          speakers: "说话人",
          sessions: "会话与回放",
          tui: "TUI 与多语言",
          roadmap: "路线图",
          ops: "运维",
          pages: "GitHub Pages",
        }),
        editLink: {
          pattern:
            "https://github.com/QinYangWang/baribari/edit/main/docs/:path",
          text: "在 GitHub 上编辑",
        },
        lastUpdated: {
          text: "更新于",
          formatOptions: { dateStyle: "medium" },
        },
        docFooter: { prev: "上一页", next: "下一页" },
        returnToTopLabel: "回到顶部",
        sidebarMenuLabel: "菜单",
        darkModeSwitchLabel: "外观",
        lightModeSwitchTitle: "切换到浅色",
        darkModeSwitchTitle: "切换到深色",
        footer: {
          message:
            'MIT · <a href="https://github.com/QinYangWang/baribari">GitHub</a>',
          copyright: "© baribari 贡献者",
        },
      },
    },
    ja: {
      label: "日本語",
      lang: "ja",
      link: "/ja/",
      title: "baribari",
      description: "ターミナルでローカル優先の会議リアルタイム文字起こし — 設計ドキュメント",
      themeConfig: {
        siteTitle: "baribari",
        outline: { level: [2, 3], label: "このページ" },
        nav: nav("/ja", {
          home: "ホーム",
          design: "設計",
          architecture: "アーキテクチャ",
          asr: "ASR パイプライン",
          speakers: "話者",
          sessions: "セッション",
          tui: "TUI と i18n",
          roadmap: "ロードマップ",
          pages: "GitHub Pages",
        }),
        sidebar: side("/ja", {
          design: "設計",
          overview: "ホーム",
          architecture: "アーキテクチャ",
          asr: "ASR パイプライン",
          speakers: "話者",
          sessions: "セッションと再生",
          tui: "TUI と i18n",
          roadmap: "ロードマップ",
          ops: "運用",
          pages: "GitHub Pages",
        }),
        editLink: {
          pattern:
            "https://github.com/QinYangWang/baribari/edit/main/docs/:path",
          text: "GitHub で編集",
        },
        lastUpdated: {
          text: "更新",
          formatOptions: { dateStyle: "medium" },
        },
        docFooter: { prev: "前へ", next: "次へ" },
        returnToTopLabel: "トップへ",
        sidebarMenuLabel: "メニュー",
        darkModeSwitchLabel: "外観",
        lightModeSwitchTitle: "ライトモード",
        darkModeSwitchTitle: "ダークモード",
        footer: {
          message:
            'MIT · <a href="https://github.com/QinYangWang/baribari">GitHub</a>',
          copyright: "© baribari contributors",
        },
      },
    },
  },
});
