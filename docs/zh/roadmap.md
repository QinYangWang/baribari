---
title: 路线图
description: baribari 现在、接下来、随后与实验中的工作
aside: false
---

# 路线图

<div class="roadmap-hero">
  <span class="roadmap-eyebrow">本地优先 · 开源 · 可自部署</span>
  <p class="roadmap-lead">把现场语音变成可以共享、回看和继续利用的理解，同时把音频控制权留给你。</p>
  <p>看板表达优先级，不承诺发布日期。只有稳定性和实测质量支撑得住，任务才会进入下一阶段。</p>
</div>

::: tip 当前重点
先让数小时会议连续、可恢复，再在稳定底座上改善日语字幕和说话人识别。
:::

<div class="roadmap-board">
  <section class="roadmap-column is-now">
    <header class="roadmap-column-header"><span class="roadmap-column-title">现在</span><span class="roadmap-count">2</span></header>
    <article class="roadmap-task">
      <span class="roadmap-label">稳定性</span><h3>不会轻易中断的会议</h3>
      <p>模型、音频或终端异常时，也要保护正在进行的会议。</p>
      <ul><li>录音流式落盘并限制所有队列</li><li>原子写入状态并恢复未结束会话</li><li>续传、校验并重试模型下载</li><li>覆盖数小时采集与续录压力测试</li></ul>
    </article>
    <article class="roadmap-task">
      <span class="roadmap-label">质量</span><h3>可信的统一基准</h3>
      <p>先测量，再调模型，也只宣传能复现的提升。</p>
      <ul><li>对比 SenseVoice、Fun-ASR-Nano 与 ReazonSpeech</li><li>覆盖日语快语速、轮流发言、噪声和远场</li><li>记录错误率、最终字幕延迟、内存与 CPU</li></ul>
    </article>
  </section>

  <section class="roadmap-column is-next">
    <header class="roadmap-column-header"><span class="roadmap-column-title">接下来</span><span class="roadmap-count">2</span></header>
    <article class="roadmap-task">
      <span class="roadmap-label">字幕</span><h3>更早理解正在说什么</h3>
      <p>缩短可靠字幕的等待时间，同时避免把一句话切得太碎。</p>
      <ul><li>优化模型感知的 VAD 与最终句提交</li><li>支持人名和领域术语热词</li><li>评估流式草稿 + 离线最终句</li><li>验证 online Zipformer 临时字幕</li></ul>
    </article>
    <article class="roadmap-task">
      <span class="roadmap-label">说话人</span><h3>记住是谁在说话</h3>
      <p>宁可诚实标记不确定，也不要自信地认错人。</p>
      <ul><li>多窗口声纹投票</li><li>检测长片段中的说话人切换</li><li>支持不确定、混合、拆分与重新匹配</li><li>提供可选的会后说话人重标</li></ul>
    </article>
  </section>

  <section class="roadmap-column is-later">
    <header class="roadmap-column-header"><span class="roadmap-column-title">随后</span><span class="roadmap-count">2</span></header>
    <article class="roadmap-task">
      <span class="roadmap-label">知识</span><h3>可以继续利用的会议记录</h3>
      <p>从一份转写文件，走向持久、可搜索的上下文。</p>
      <ul><li>全文搜索并跳到对应时刻</li><li>编辑时保留原文与译文</li><li>导出 SRT、VTT、Markdown 和 JSON</li><li>批量导入并重跑指定片段</li></ul>
    </article>
    <article class="roadmap-task">
      <span class="roadmap-label">自部署</span><h3>一套语音引擎，多人使用</h3>
      <p>一台设备负责采集和推理，团队从浏览器跟进。</p>
      <ul><li>增加 <code>baribari serve</code> 与版本化事件协议</li><li>通过游标重连并去重消息</li><li>提供访问令牌、API、Webhook 和基础管理页</li><li>补充 Docker、systemd 与局域网部署</li></ul>
    </article>
  </section>

  <section class="roadmap-column is-lab">
    <header class="roadmap-column-header"><span class="roadmap-column-title">实验场</span><span class="roadmap-count">2</span></header>
    <article class="roadmap-task">
      <span class="roadmap-label">语音</span><h3>跨语言开口交流</h3>
      <p>探索把翻译变成音频，同时保留用户控制。</p>
      <ul><li>翻译 → TTS → 虚拟麦克风</li><li>验证延迟、打断策略与回声控制</li><li>近期不做声音克隆</li></ul>
    </article>
    <article class="roadmap-task">
      <span class="roadmap-label">学习</span><h3>带反馈的口语练习</h3>
      <p>验证本地语音底座能否提供真正有用的口语指导。</p>
      <ul><li>音素对齐与发音反馈</li><li>重音、节奏、音高和语法指导</li><li>可选的置顶字幕窗口</li></ul>
    </article>
  </section>
</div>

## 平台底座

所有任务都依赖稳定的引擎层：统一 ASR、说话人、翻译和 TTS 接口；统一且可校验的模型目录；版本化字幕事件 API；以及进入回归测试的性能与质量基准。

## 近期不做

<div class="roadmap-not-doing"><span>移动端客户端</span><span>商业 SaaS 与计费</span><span>默认依赖云端</span><span>完整视频会议系统</span><span>近期声音克隆</span><span>无分离模型的完美叠话拆分</span></div>

## 如何参与

- 选择边界明确的任务卡，大型实现前先开 issue
- 新模型需附许可证、来源、基准数据和可复现样本
- 质量问题请提供语言、音频环境、模型和预期结果
- 捐献用于模型托管、CI、签名和测试设备；功能始终保持开放
