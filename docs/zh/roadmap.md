# 路线图

<div class="roadmap-hero">
  <span class="roadmap-eyebrow">LOCAL-FIRST · OPEN SOURCE</span>
  <p class="roadmap-lead">把 baribari 做成稳定、可自部署、专注中日英会议的实时语音工具。</p>
  <p>路线图表达推进方向，不承诺具体发布日期。稳定性和可验证的识别质量始终优先于功能数量。</p>
</div>

## 一眼看懂

<div class="roadmap-grid">
  <article class="roadmap-card is-now">
    <span class="roadmap-status">现在</span>
    <h3>长会稳定性</h3>
    <p>控制内存、恢复异常会话，确保模型或音频错误不会卡死 TUI。</p>
  </article>
  <article class="roadmap-card is-next">
    <span class="roadmap-status">接下来</span>
    <h3>字幕与说话人质量</h3>
    <p>降低最终字幕延迟，改善日语快语速和多人会议中的说话人匹配。</p>
  </article>
  <article class="roadmap-card is-later">
    <span class="roadmap-status">随后</span>
    <h3>会话与 Headless</h3>
    <p>完善搜索、编辑和导出，并让一台设备为局域网中的多人提供转写。</p>
  </article>
  <article class="roadmap-card is-explore">
    <span class="roadmap-status">探索</span>
    <h3>实时语音应用</h3>
    <p>尝试翻译语音输出、悬浮字幕和口语练习，不阻塞核心路线。</p>
  </article>
</div>

::: tip 当前重点
先让 baribari 能连续、可恢复地完成数小时会议，再扩展新的客户端和交互形态。
:::

## 1. 稳定完成长会议 <Badge type="danger" text="当前" />

**目标：** 即使模型、音频设备或终端输出异常，会议也能继续记录或安全恢复。

- 将 WAV 逐步写入磁盘，避免长时间录音占满内存
- 为开放中的会话增加崩溃恢复和原子写入
- 限制音频、推理和 UI 队列，避免 TUI 阻塞
- 改进 Windows 模型下载的续传、校验和损坏重试
- 覆盖暂停、续录、音频合并和播放位置恢复测试
- 补充 Linux 与 macOS 的采集能力说明

**完成标志：** 数小时会议内存保持稳定；单个组件失败不会破坏已保存内容。

## 2. 提升实时字幕质量 <Badge type="warning" text="下一步" />

**目标：** 缩短“说完一句话”到“看到可靠最终字幕”的等待时间。

- 建立 SenseVoice、Fun-ASR-Nano、ReazonSpeech 的统一基准测试
- 纳入日语快语速、多人轮流发言、远场和噪声样本
- 持续记录首字延迟、最终字幕延迟、错误率和资源占用
- 优化 VAD 切断与最终字幕提交策略
- 支持可选的 online Zipformer partial 字幕
- 评估“流式临时字幕 + 离线最终字幕”的双阶段识别
- 增加人名、术语和产品名热词

## 3. 改善说话人识别 <Badge type="warning" text="下一步" />

**目标：** 宁可标记为不确定，也不把发言强行归给错误的人。

- 完善 ERes2Net-large、CAM++ 和全局声纹名册的模型选择
- 使用多窗口 embedding 投票处理较长发言
- 检测长 VAD 片段中的说话人变化点
- 增加 `不确定` / `混合说话人` 状态与候选匹配
- 改进改名、合并、拆分和重新匹配流程
- 提供可选的会后 offline diarization 重标

> 重叠语音需要专门的分离模型。近期目标是减少误判，而不是承诺完美拆分叠话。

## 4. 让会议记录真正可用 <Badge type="info" text="随后" />

**目标：** 用户能找到、修正并带走一次会议的结果。

- 导出 SRT、VTT、Markdown 和 JSON
- 全文搜索并跳转到对应时间
- 支持会话名称、标签和收藏
- 分别保存原文、人工修订文本和译文
- 支持单条或批量重新识别、翻译
- 支持会后重新执行说话人识别
- 批量导入已有音频和视频

## 5. 支持 Headless 多人共享 <Badge type="info" text="随后" />

**目标：** 一台设备负责采集和推理，其他人通过浏览器查看同一场会议。

- 提供 `baribari serve` 服务模式
- 定义带版本的 WebSocket 字幕事件协议
- 支持断线重连、游标续传和消息去重
- 将共享会话持久化到磁盘
- 增加可选访问令牌和只读权限
- 提供 Docker、systemd 与局域网部署文档
- 提供基础 Web 管理页、API 和 Webhook

这一阶段面向简单自部署，不建设商业 SaaS 所需的计费和复杂多租户系统。

## 6. 开放模型与引擎 <Badge type="info" text="随后" />

**目标：** 新模型可以独立接入，不必改写会议、会话和 UI 逻辑。

- 统一 ASR、翻译、TTS 和说话人模型接口
- 统一模型清单、下载、校验与版本管理
- 提供社区模型适配模板
- 开放稳定的字幕事件 API
- 将性能与准确率基准纳入回归测试

## 实验场

这些方向有价值，但不会阻塞核心路线：

| 方向 | 验证重点 |
| --- | --- |
| 翻译 → TTS → 音频输出 | 延迟、打断策略与回声控制 |
| 虚拟麦克风 | Windows/macOS 安装体验与兼容性 |
| 置顶字幕窗 | 是否值得引入 Tauri 或原生窗口 |
| AI 口语练习 | 音素对齐、重音、节奏和音高反馈 |
| 隐私模式 | 不落盘音频、仅本地 AI、可验证的数据边界 |

## 近期不做

<div class="roadmap-not-doing">
  <span>移动端客户端</span>
  <span>商业 SaaS 与计费</span>
  <span>默认依赖云端模型</span>
  <span>完整视频会议系统</span>
  <span>近期声音克隆</span>
  <span>无分离模型的完美叠话拆分</span>
</div>

## 如何参与

- 从标记为 `good first issue` 或 `help wanted` 的任务开始
- 提交新模型时附带许可证、下载来源和基准结果
- 报告识别问题时提供语言、音频环境、模型和可复现样本
- 通过捐献支持模型托管、CI、签名和测试设备等公共成本

功能不会因捐献而被锁定；捐献只帮助项目投入更多维护与测试资源。
