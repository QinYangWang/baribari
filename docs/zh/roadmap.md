# 路线图备忘

本文记录当前的产品和工程优先级，仅表示规划方向，不代表确定的发布日期或功能承诺。

## P0 — 稳定与长会

- WAV 流式落盘（避免数小时内存缓冲）  
- 崩溃恢复  
- 加强 Linux/macOS 采集说明；保持 Windows loopback 优势文档  
- session 路径、clip 合并、resume seek 测试  

## P1 — 会议产品力

- 导出 SRT / VTT / Markdown / JSON  
- 说话人改名/合并/名册（部分已交付）  
- **Partial UI + 可选 online zipformer**  
- resume 全文搜索 + 跳转  
- 更友好的会话命名/列表（部分已交付）  

## P1.5 — 说话人质量

- 长 VAD 段内 embedding **换人点**切开  
- `mixed` / 不确定 + 更好手动修  
- 可选 **offline diarization** 会后重标（非实时主路径）  

## P2 — 协作与引擎

- LAN 鉴权/角色/重连  
- Headless / 服务模式  
- `--engine-cmd` 外部识别器  
- 可插拔 ASR：SenseVoice \| zipformer-online \| Qwen3-ASR  

## P3 — 差异化

- 同传输出：翻译 → TTS → 指定输出设备/虚拟线（克隆靠后）  
- 置顶字幕窗  
- 隐私模式（不落盘音频、仅本地 AI）  

## 近期明确非目标

- 默认改成纯云端流式  
- 默认捆绑非商用 diar 模型  
- 无分离模型却承诺完美叠话拆分  
