---
title: 'Kafka 分区、幂等与吞吐调优'
description: '如何选择 key 决定分区与有序性；幂等 producer 的意义；batch/linger/压缩的调优策略。'
---

## 1. 分区与 key：你在取舍什么

Kafka 的并行度来自分区（partition），而你选择的 key 决定“同 key 的消息落到同一分区”。

常见目标：

- **按设备有序**：key = <code v-pre>{{device_id}}</code>（推荐默认）
- **最大并行度**：key 为空或更均匀散列（但设备内顺序不保证）

::: tip 推荐
绝大多数 IoT 场景，按设备有序是最合理平衡：同设备的状态/遥测更容易被平台侧正确解释。
:::

---

## 2. 幂等 producer

Kafka 插件默认启用幂等 producer（`enableIdempotence=true`）。

作用：

- 在网络抖动导致重试时，尽量减少重复写入的风险（更强交付语义）

注意：

- 幂等并不等价于“端到端 exactly-once”（平台侧仍需幂等消费）

---

## 3. 吞吐调优

### 3.1 先确认平台侧消费能力

如果 consumer 跑不动，你在 producer 侧调再多也只会堆积。

### 3.2 调 batch/linger/压缩

- `lingerMs`：提高吞吐但增加延迟
- `batchSizeBytes` / `batchNumMessages`：提高吞吐但增加内存占用
- `compression`：压缩可以省带宽，但会吃 CPU

