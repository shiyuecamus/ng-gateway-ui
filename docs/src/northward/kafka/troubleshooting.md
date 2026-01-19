---
title: 'Kafka 排障'
description: 'Kafka 插件常见问题定位：连接失败、ACL、TLS/SASL、topic 渲染异常、队列满、消费组 offset 与下行不生效。'
---

## 1. 连接失败（Failed）

### 1.1 broker 不可达

- 检查 `bootstrapServers`
- 容器网络（DNS、端口映射）
- broker listener 配置（advertised.listeners）

### 1.2 ACL/鉴权失败（SASL/TLS）

- 机制是否匹配（PLAIN/SCRAM）
- 用户是否有 topic produce/consume 权限
- TLS 的 CA 是否正确、是否启用了 hostname 校验

见：[`Kafka 连接与安全`](/northward/kafka/connection-security)

---

## 2. Connected 但没有数据

优先确认：

- 是否创建 AppSubscription
- `uplink.enabled` 与 `uplink.telemetry.enabled` 是否开启
- topic 是否被渲染为空（模板变量缺失）

---

## 3. 队列满（outbound queue rejected）

含义：

- 插件内部有一个有界 outbound queue（用于把 I/O 放出热路径），当 Kafka I/O 或 delivery 回执堆积时可能拒绝发送。

建议：

- 优先检查平台侧消费与 broker 负载（是否出现拥塞/限流）
- 拆分 App（遥测与控制面分开）
- 调整 producer batch/linger（降低发送压力或提高吞吐）
- 配合 `QueuePolicy` 做可预测背压：[`QueuePolicy`](/northward/policies/queue-policy)

---

## 4. 下行不生效

检查顺序：

1. downlink 是否 `enabled`
2. topic 是否精确匹配（不可模板/不可 wildcard）
3. payload 是否是正确的 EnvelopeJson/MappedJson
4. `ackPolicy/failurePolicy` 是否符合预期（是否被 drop/ignore）

下行语义见：[`Kafka 下行（Downlink）`](/northward/kafka/downlink)

