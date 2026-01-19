---
title: 'Pulsar 下行（Downlink）'
description: 'Shared subscription 消费精确 topic 列表；把消息解码为 NorthwardEvent；解释 ack/nack 与 filter 语义。'
---

## 1. 下行如何工作（实现要点）

- subscription name：`ng-gateway-plugin-{app_id}`（稳定命名，方便 broker 侧维护状态）
- subscription type：Shared
- topics：来自 route table 的**精确 topic 列表**

::: warning
下行 topic 不支持模板/通配/regex。
:::

---

## 2. AckPolicy / FailurePolicy（ack/nack 语义）

Pulsar 的确认语义：

- `ack_policy=never`：不 ack
- `ack_policy=always`：总是 ack（坏消息会被丢弃）
- `ack_policy=on_success`：
  - 成功转为事件，或被 filter 忽略（Ok(None)）→ ack
  - 失败：
    - `failure_policy=drop` → ack（丢弃）
    - `failure_policy=error` → nack（等待重试/重投）

详见：[`下行总览`](/northward/downlink/overview)

---

## 3. payload 模式

- 推荐：EnvelopeJson（`event.kind` 可路由，适合混合 topic）
- 平台 shape 不一致：MappedJson + filter

入口：

- [`下行 EnvelopeJson`](/northward/downlink/envelope-json)
- [`下行 MappedJson + Filter`](/northward/downlink/mapped-json)

