---
title: '最佳实践：可靠性与弱网'
description: '北向可靠性不是越多越好：如何用 RetryPolicy/QueuePolicy 做“可预测控制”，以及当前版本与 Roadmap 的边界。'
---

## 1. 可靠性目标要分级

不同数据的价值不同：

- **控制/告警/关键事件**：更接近“必须到达”
- **高频遥测**：更接近“尽量新鲜”

如果你把它们混在一起，你最终只能选择一种策略，必然对其中一类不友好。

---

## 2. 当前版本的可靠性能力边界

::: warning 当前版本不提供磁盘断网续传
当前版本主要依赖：
- `RetryPolicy`：连接/发送失败后的重试与退避
- `QueuePolicy`：主队列 + 可选内存 buffer（短时抖动）

不提供：
- 磁盘 WAL 持久化
- 回放速率控制
- 精细化丢弃/采样/合并（latest merge 等）
:::

路线图见：[`路线图`](/guide/introduction/roadmap)

---

## 3. 现场建议（可直接抄）

- **拆分 App**：关键链路与遥测分开
- **给关键链路更长的重试窗口**：但不要无限重试掩盖配置错误
- **buffer 只用于短时抖动**：例如 30s~10min；并设置 `bufferExpireMs`
- **监控与告警**：
  - dropped 计数
  - 连接状态（Connected/Failed）
  - 平台侧 backlog（Kafka lag / Pulsar backlog）

