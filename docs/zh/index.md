---
layout: home
title: baribari
titleTemplate: 终端里的会议实时转写

hero:
  name: baribari
  text: 人在会里，字留得住。
  tagline: 在终端中实时转写会议，支持本地识别、说话人标注和可选 AI。会后可随时打开会话，继续录制、翻译或总结，适合需要频繁参会并保留可靠记录的人。
  actions:
    - theme: brand
      text: 开始使用
      link: https://github.com/QinYangWang/baribari/blob/main/README.zh.md#%E5%BF%AB%E9%80%9F%E5%BC%80%E5%A7%8B
    - theme: alt
      text: 了解原理
      link: /zh/architecture
    - theme: alt
      text: 在 npm 查看
      link: https://www.npmjs.com/package/baribari

features:
  - title: 边听边看实时字幕
    details: 会议进行时，字幕会持续显示在终端中。错过某句话时，可以直接向上查看历史内容，无需等到会后再整理零散笔记。
    link: /zh/sessions
    linkText: 查看会话说明
  - title: 默认在本地处理语音
    details: SenseVoice 和 Silero VAD 均在本机运行，语音识别无需上传音频。只有主动启用云端 AI 纠错、翻译或总结时，相关文本才会发送到所配置的服务。
    link: /zh/asr-pipeline
    linkText: 查看识别说明
  - title: 标注每段话的说话人
    details: 程序通过声纹区分说话人，并用全局名册记住经常参会的人。如果自动识别有误，还可以合并、重命名或手动指派说话人。
    link: /zh/speakers
    linkText: 查看说话人说明
  - title: 每场会议单独保存
    details: 每次实时转写都会自动保存字幕，也可选择保存录音。之后可以继续录制、翻译或总结，无需查找散落的临时文件。
    link: /zh/sessions
    linkText: 查看回放说明
  - title: 无需重复安装模型即可共享
    details: 一台设备在局域网中负责转写，其他人可通过浏览器或命令行实时查看最终字幕，无需各自下载识别模型。
    link: /zh/architecture
    linkText: 查看架构说明
  - title: 终端界面支持三种语言
    details: 主持方使用全屏 TUI，界面可在中文、日本語和 English 之间切换。界面语言与语音识别语言相互独立。
    link: /zh/tui-i18n
    linkText: 查看界面说明
---
