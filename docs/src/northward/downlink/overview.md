---
title: '下行总览（平台 → 网关）'
description: 'Kafka/Pulsar 等插件支持从 topic 接收下行消息并映射为 NorthwardEvent：WritePoint/Command/RpcResponseReceived。'
---

## 1. 下行解决什么问题

下行（Downlink）让“平台侧请求”进入网关，并最终触达 southward：

- **WritePoint**：写点
- **CommandReceived**：平台下发命令
- **RpcResponseReceived**：平台返回 RPC 响应

这些下行消息会被插件解析成 `NorthwardEvent`，再由 core 做校验、串行化（按 channel）并分发给设备。

---

## 2. Topic 限制：只支持精确 topic

当前下行订阅严格要求 **exact topic**：

- 不允许 <code v-pre>{{template}}</code>
- 不允许 `*` wildcard
- 不允许 `re:`/`regex:` 前缀

::: tip 为什么这么设计
下行是控制面，必须 **可预测、可审计、可限流**。wildcard 会导致不受控的 fan-in（甚至被误投递/攻击）。
:::

---

## 3. payload 模式

下行支持两种 payload：

- **EnvelopeJson**（推荐）：稳定包络 + event.kind 路由
- **MappedJson**：把任意 JSON 映射成目标事件结构（带 filter，避免混合 topic 噪声）

入口：

- [`下行 EnvelopeJson`](/northward/downlink/envelope-json)
- [`下行 MappedJson + Filter`](/northward/downlink/mapped-json)

---

## 4. AckPolicy / FailurePolicy

不同 broker 的确认机制不同（Kafka commit / Pulsar ack/nack），但 northward 统一用两组策略表达：

### 4.1 AckPolicy

- `on_success`：只有当消息“被正确解析并成功转为事件（或被过滤忽略）”时确认
- `always`：无论解析成功/失败都确认（相当于 drop-on-failure）
- `never`：从不确认（调试用途；生产慎用）

### 4.2 FailurePolicy（仅在 `on_success` 且失败时生效）

- `drop`：失败也确认（丢弃坏消息，避免 poison message 卡住）
- `error`：失败不确认（Kafka 不 commit / Pulsar nack），用于要求平台侧修复消息后重投

::: warning 生产建议
绝大多数生产系统更需要“可持续运行”，因此建议：
- 控制面 topic 单独隔离
- 默认 `ack_policy=on_success` + `failure_policy=drop`
只有在你能保证平台侧“重投机制 + 幂等处理”时，才考虑 `failure_policy=error`。
:::

