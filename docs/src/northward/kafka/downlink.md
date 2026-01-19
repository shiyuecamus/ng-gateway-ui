---
title: 'Kafka 下行（Downlink）'
description: 'Kafka consumer 订阅精确 topic，把消息解码为 NorthwardEvent；解释 ack/commit 语义与 auto.offset.reset=latest 的影响。'
---

## 1. 支持的下行事件

Kafka 下行支持把消息映射为：

- WritePoint
- CommandReceived
- RpcResponseReceived

下行总览见：[`下行总览`](/northward/downlink/overview)

---

## 2. Topic 与订阅组（实现细节）

### 2.1 精确 topic 限制

downlink 的 `topic` 必须是**精确字符串**，不支持：

- `{{template}}`
- `*` wildcard
- `re:` / `regex:`

### 2.2 consumer group

consumer group id 固定为：

- `ng-gateway-plugin-{app_id}`

并且：

- `enable.auto.commit=false`（由 AckPolicy 控制 commit）
- `auto.offset.reset=latest`

::: warning `auto.offset.reset=latest` 的含义
当该 consumer group 没有 offset 时，会从 **latest** 开始消费（不会回溯历史）。  
如果你期望“从最早消费”，当前版本未提供该选项（需要平台侧/运维侧另行处理）。
:::

---

## 3. AckPolicy / FailurePolicy（commit 行为）

Kafka 下行的“确认”对应 commit：

- `ack_policy=never`：不 commit
- `ack_policy=always`：无论成功失败都 commit（丢弃坏消息）
- `ack_policy=on_success`：
  - 解析成功或被过滤忽略 → commit
  - 解析失败：
    - `failure_policy=drop` → commit（丢弃）
    - `failure_policy=error` → 不 commit（等待重投/修复）

---

## 4. payload 选择

推荐优先使用 EnvelopeJson（稳定、混合 topic 可路由）：

- [`下行 EnvelopeJson`](/northward/downlink/envelope-json)

如果平台侧 shape 不一致，再使用 MappedJson，并且在混合 topic 场景务必加 filter：

- [`下行 MappedJson + Filter`](/northward/downlink/mapped-json)

---

## 5. 常见坑

- **topic 配了模板**：会被拒绝（downlink 必须精确 topic）
- **同一 topic 混合多种 route，但 ack_policy 不一致**：构建路由表时会报错
- **headers 非 UTF-8**：filter.mode=property 无法匹配（会被忽略）

