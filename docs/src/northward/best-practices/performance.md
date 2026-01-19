---
title: '最佳实践：性能与吞吐'
description: '北向吞吐调优：批处理、压缩、分区 key、队列与 backpressure 的组合策略。'
---

## 1. 先定义“吞吐目标”

你需要明确：

- 每秒消息数（msg/s）
- 每条消息体积（bytes）
- 平台侧允许的延迟（p95/p99）

没有目标就无法调参，只会“拍脑袋”。

---

## 2. 先做隔离，再做调优

在调吞吐之前，先按 [`架构与隔离`](/northward/best-practices/architecture) 拆分 App，避免：

- 遥测把控制面挤掉
- 一个慢 consumer 影响整个系统

---

## 3. 批处理与压缩（Kafka/Pulsar）

### 3.1 Kafka

Kafka producer 有 `linger.ms`、`batch.size`、`batch.num.messages`、`compression.type` 等参数。  
大方向：

- 网络好、吞吐优先：适当增加 batch 与小的 linger（例如 5~20ms）
- 延迟敏感：降低 linger，减少 batch

### 3.2 Pulsar

Pulsar producer 支持 batching（默认关闭）与 compression（默认 LZ4）。  
在高吞吐场景，建议开启 batching 并合理设置：

- max messages
- max bytes
- max publish delay

---

## 4. 分区 key 的取舍

分区决定“并行度 vs 有序性”：

- 按设备分区：通常是最佳平衡（同设备有序，多设备并行）
- 按点位分区：分区过多且热点明显，通常不推荐

---

## 5. 队列与背压：不要追求“永不丢”

如果平台侧短时不可用，你必须选择：

- 丢弃（保护网关）
- 阻塞（牺牲吞吐）
- 缓冲（短时抖动）

见：[`QueuePolicy（队列与缓冲）`](/northward/policies/queue-policy)

