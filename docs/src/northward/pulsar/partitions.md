---
title: 'Pulsar 分区与吞吐（partition_key）'
description: 'partition_key 如何影响分区与有序性；如何在 topic 规划、batching 与队列策略之间做取舍。'
---

## 1. partition_key 的作用

Pulsar 的 `partition_key` 类似于 Kafka 的 record key：

- 同 key 的消息会被路由到同一分区（取决于 topic 类型与路由策略）
- 会影响“设备内有序性”与“并行吞吐”

建议默认按设备分区：

```text
{{device_id}}
```

---

## 2. 吞吐调优建议

- 先确认平台侧 backlog（consumer 是否跑得动）
- 高吞吐场景开启 batching（参见 uplink producer 参数）
- 配合 `QueuePolicy.dropPolicy=Discard` 保护网关稳定性（遥测链路）

见：

- [`Pulsar 上行（Uplink）`](/northward/pulsar/uplink)
- [`QueuePolicy`](/northward/policies/queue-policy)

