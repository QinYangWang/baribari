import { defineConfig } from "vitepress";

// Project Pages: https://<user>.github.io/baribari/
const base = process.env.DOCS_BASE || "/baribari/";

type SideLabels = {
  start: string;
  overview: string;
  install: string;
  quickStart: string;
  use: string;
  live: string;
  sessions: string;
  speakers: string;
  share: string;
  configure: string;
  configuration: string;
  modelsAi: string;
  tui: string;
  reference: string;
  cli: string;
  files: string;
  project: string;
  architecture: string;
  asr: string;
  roadmap: string;
  help: string;
  troubleshooting: string;
};

type NavLabels = {
  home: string;
  docs: string;
  blog: string;
  overview: string;
  install: string;
  quickStart: string;
  cli: string;
};

function side(prefix: string, t: SideLabels) {
  const p = prefix === "/" ? "" : prefix;
  return [
    {
      text: t.start,
      collapsed: false,
      items: [
        { text: t.overview, link: `${p}/overview` },
        { text: t.install, link: `${p}/install` },
        { text: t.quickStart, link: `${p}/quick-start` },
      ],
    },
    {
      text: t.use,
      collapsed: false,
      items: [
        { text: t.live, link: `${p}/live` },
        { text: t.sessions, link: `${p}/sessions` },
        { text: t.speakers, link: `${p}/speakers` },
        { text: t.share, link: `${p}/share` },
      ],
    },
    {
      text: t.configure,
      collapsed: false,
      items: [
        { text: t.configuration, link: `${p}/configuration` },
        { text: t.modelsAi, link: `${p}/models-ai` },
        { text: t.tui, link: `${p}/tui-i18n` },
      ],
    },
    {
      text: t.reference,
      collapsed: false,
      items: [
        { text: t.cli, link: `${p}/cli` },
        { text: t.files, link: `${p}/files` },
      ],
    },
    {
      text: t.project,
      collapsed: true,
      items: [
        { text: t.architecture, link: `${p}/architecture` },
        { text: t.asr, link: `${p}/asr-pipeline` },
        { text: t.roadmap, link: `${p}/roadmap` },
      ],
    },
    {
      text: t.help,
      collapsed: true,
      items: [
        { text: t.troubleshooting, link: `${p}/troubleshooting` },
      ],
    },
  ];
}

function nav(prefix: string, t: NavLabels) {
  const p = prefix === "/" ? "" : prefix;
  return [
    { text: t.home, link: `${p}/` },
    {
      text: t.docs,
      items: [
        { text: t.overview, link: `${p}/overview` },
        { text: t.install, link: `${p}/install` },
        { text: t.quickStart, link: `${p}/quick-start` },
        { text: t.cli, link: `${p}/cli` },
      ],
    },
    { text: t.blog, link: `${p}/blog/` },
  ];
}

export default defineConfig({
  title: "baribari",
  description:
    "Local speech intelligence for live understanding and lasting knowledge",
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
          "Private speech intelligence for live understanding, speaker memory, durable sessions, and self-hosted collaboration.",
      },
    ],
  ],
  themeConfig: {
    siteTitle: "baribari",
    logo: undefined,
    socialLinks: [
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
      description: "Local speech intelligence for live understanding and lasting knowledge",
      themeConfig: {
        siteTitle: "baribari",
        outline: { level: [2, 3], label: "On this page" },
        nav: nav("/", {
          home: "Home",
          docs: "Docs",
          blog: "Blog",
          overview: "Overview",
          install: "Install",
          quickStart: "Quick start",
          cli: "CLI reference",
        }),
        sidebar: side("/", {
          start: "Start here",
          overview: "Overview",
          install: "Install",
          quickStart: "Quick start",
          use: "Use baribari",
          live: "Live transcription",
          sessions: "Sessions & resume",
          speakers: "Speakers",
          share: "LAN sharing",
          configure: "Configure",
          configuration: "Configuration",
          modelsAi: "Models & AI",
          tui: "TUI & languages",
          reference: "Reference",
          cli: "CLI reference",
          files: "Files & paths",
          project: "Project",
          architecture: "Architecture",
          asr: "ASR pipeline",
          roadmap: "Roadmap",
          help: "Help",
          troubleshooting: "Troubleshooting",
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
      description: "面向实时理解与持久知识的本地语音智能",
      themeConfig: {
        siteTitle: "baribari",
        outline: { level: [2, 3], label: "本页目录" },
        nav: nav("/zh", {
          home: "首页",
          docs: "文档",
          blog: "博客",
          overview: "概览",
          install: "安装",
          quickStart: "快速开始",
          cli: "CLI 参考",
        }),
        sidebar: side("/zh", {
          start: "从这里开始",
          overview: "概览",
          install: "安装",
          quickStart: "快速开始",
          use: "使用 baribari",
          live: "实时转写",
          sessions: "会话与回放",
          speakers: "说话人",
          share: "局域网共享",
          configure: "配置",
          configuration: "配置说明",
          modelsAi: "模型与 AI",
          tui: "TUI 与语言",
          reference: "参考",
          cli: "CLI 参考",
          files: "文件与路径",
          project: "项目",
          architecture: "架构",
          asr: "识别管线",
          roadmap: "路线图",
          help: "帮助",
          troubleshooting: "故障排查",
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
      description: "リアルタイム理解と持続的な知識のためのローカル音声知能",
      themeConfig: {
        siteTitle: "baribari",
        outline: { level: [2, 3], label: "このページ" },
        nav: nav("/ja", {
          home: "ホーム",
          docs: "ドキュメント",
          blog: "ブログ",
          overview: "概要",
          install: "インストール",
          quickStart: "クイックスタート",
          cli: "CLI リファレンス",
        }),
        sidebar: side("/ja", {
          start: "はじめる",
          overview: "概要",
          install: "インストール",
          quickStart: "クイックスタート",
          use: "baribari を使う",
          live: "ライブ文字起こし",
          sessions: "セッションと再開",
          speakers: "話者",
          share: "LAN 共有",
          configure: "設定",
          configuration: "設定",
          modelsAi: "モデルと AI",
          tui: "TUI と言語",
          reference: "リファレンス",
          cli: "CLI リファレンス",
          files: "ファイルとパス",
          project: "プロジェクト",
          architecture: "アーキテクチャ",
          asr: "ASR パイプライン",
          roadmap: "ロードマップ",
          help: "ヘルプ",
          troubleshooting: "トラブルシューティング",
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
