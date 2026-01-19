---
title: 'EnvelopeJson（稳定包络）'
description: '北向默认 payload：schema_version + event.kind + envelope(meta) + payload.data。适合长期演进与混合事件。'
---

## 1. 设计目标

EnvelopeJson 追求三件事：

- **稳定**：wire format 有 `schema_version`，便于长期演进
- **可路由**：`event.kind` 是稳定判别字段（混合 topic 场景必需）
- **payload 不打 tag**：业务数据放在 `payload.data` 里，不再嵌套 enum tag，减少耦合

---

## 2. JSON 形状（schema_version = 1）

```json
{
  "schema_version": 1,
  "event": { "kind": "telemetry" },
  "envelope": {
    "ts_ms": 1734870900000,
    "app": { "id": 1, "name": "my-app", "plugin_type": "kafka" },
    "device": { "id": 1001, "name": "dev-1", "type": "pump-v1" }
  },
  "payload": {
    "data": {}
  }
}
```

::: tip 重要约束
`payload.data` 内部 **不会再出现 enum tag**（例如 `{"Telemetry": {...}}` 这种形状不会出现）。  
**唯一判别字段是 `event.kind`**。
:::

---

## 3. `event.kind` 枚举值（snake_case）

### 3.1 uplink（网关 → 平台）

- `device_connected`
- `device_disconnected`
- `telemetry`
- `attributes`
- `alarm`
- `rpc_response`
- `write_point_response`

### 3.2 downlink（平台 → 网关，经插件）

- `write_point`
- `command_received`
- `rpc_response_received`

::: warning
不同插件可能只实现其中一部分事件类型。你应以具体插件文档为准。
:::

---

## 4. `envelope` 元信息

`envelope` 字段是可选的（downlink 最小输入可以不带），uplink 通常会携带：

- `ts_ms`：毫秒时间戳（Telemetry/Attributes 用采集时间；上下线事件可能使用“当前时间”）
- `app`：app id/name/plugin_type
- `device`：device id/name/type（Telemetry/Attributes 的 `type` 可能为空）

---

## 5. `payload.data` 里是什么

`payload.data` 的具体字段取决于事件类型（对应 `NorthwardData` 或 `NorthwardEvent` 的具体结构）。  
产品文档落地时会分别在插件页给出“最常见的 Telemetry/Attributes/WritePoint”示例，避免用户看不懂内部模型。

::: tip 最佳实践
对接初期，先固定用 EnvelopeJson，把链路跑通并稳定可观测；确认无误后再考虑 Kv/TimeseriesRows/MappedJson。
:::

