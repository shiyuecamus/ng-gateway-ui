---
title: '下行 MappedJson + Filter'
description: '把任意 JSON 映射成 WritePoint/Command/RpcResponseReceived；通过 filter 在混合 topic 场景避免误解析。'
---

## 1. 为什么下行也需要 MappedJson

平台侧的控制面消息经常“不是你想要的形状”，例如：

- 平台把 `pointId` 放在顶层
- value 的类型是字符串（`"1" / "true"`）
- topic 混合多种控制消息

MappedJson 允许你把输入 JSON 映射成网关期望的事件结构，然后交给 core 做统一校验与执行。

---

## 2. 配置形状

```json
{
  "mode": "mapped_json",
  "config": {
    "request_id": "requestId",
    "point_id": "pointId",
    "value": "value"
  },
  "filter": {
    "mode": "json_pointer",
    "pointer": "/eventType",
    "equals": "write_point"
  }
}
```

说明：

- `config`：**输出结构**（WritePoint/Command/RpcResponse）的字段路径 → JMESPath 表达式
- `filter`：在 decode 阶段执行
  - 不匹配 → `Ok(None)`（忽略，不算错误）
  - 匹配但映射失败/反序列化失败 → 才算错误

---

## 3. Filter 模式

### 3.1 `none`

不做过滤：所有消息都尝试按该 route 映射（混合 topic 会很吵）。

### 3.2 `json_pointer`（推荐）

用 RFC6901 JSON Pointer 提取 discriminator：

- pointer 示例：`/event/kind`、`/type`、`/eventType`
- equals：字符串比较（数值/bool 会转字符串比较）

### 3.3 `property`

用消息 metadata（Kafka header / Pulsar properties）匹配：

```json
{ "mode": "property", "key": "event_kind", "equals": "write_point" }
```

### 3.4 `key`

用消息 key 匹配（Kafka record key / Pulsar partition_key）：

```json
{ "mode": "key", "equals": "write_point" }
```

---

## 4. 生产建议

- **控制面 topic 尽量不要混合**（每种 kind 一个 topic）
- 如果必须混合：
  - EnvelopeJson：用 `event.kind` 路由（最稳定）
  - MappedJson：务必加 `filter`，否则会有大量“映射失败噪声”

