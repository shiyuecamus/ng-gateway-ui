---
title: '性能调优（update queue）'
description: 'OPC UA Server 插件内部 update queue 的容量与 drop policy；如何在“实时新鲜度 vs 完整性”之间取舍。'
---

## 1. update queue 的意义

OPC UA Server 需要把大量点位更新写入 AddressSpace。为了避免阻塞 northward 热路径，插件内部使用 update queue 批量传递更新。

---

## 2. 配置项（实现对齐）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `updateQueueCapacity` | 10000 | 队列容量（batch 数量） |
| `dropPolicy` | `discard_oldest` | 满队列策略：`discard_oldest`/`discard_newest`/`block_with_timeout` |

策略含义：

- `discard_oldest`：丢最旧 batch，保最新（更偏“实时新鲜度”）
- `discard_newest`：丢当前 batch（更偏“保留历史更新”，但容易落后）
- `block_with_timeout`：尝试阻塞等待（插件会做短超时等待，避免拖垮采集）

::: tip 默认策略为什么是 discard_oldest
OPC UA 实时订阅更关心“当前值”。当系统压力大时，丢弃旧更新可以让客户端尽快看到最新状态。
:::

---

## 3. 调优建议

- 如果你发现 UA 客户端经常“落后很多”：
  - 检查 updateQueueCapacity 是否过小
  - 检查 dropPolicy 是否适合（通常 discard_oldest 更合理）
- 如果你更关心“每条变化都不丢”：
  - 当前版本不保证（OPC UA 面向实时更合理）
  - 建议改走 Kafka/Pulsar 等消息总线链路承载历史（产品级）

