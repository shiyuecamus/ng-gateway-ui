---
title: '上行消息格式（TB Gateway API）'
description: 'ThingsBoard 插件上行采用 TB Gateway API 的 MQTT topic 与 JSON payload 形状（telemetry/attributes/connect/disconnect）。'
---

## 1. 上行 topic（实现对齐）

ThingsBoard 插件使用 TB Gateway API topic：

- Telemetry：`v1/gateway/telemetry`
- Attributes：`v1/gateway/attributes`
- Connect：`v1/gateway/connect`
- Disconnect：`v1/gateway/disconnect`

---

## 2. Telemetry JSON 形状

网关遥测会按“设备名”分组：

```json
{
  "Device-A": [
    {
      "ts": 1734870900000,
      "values": {
        "temp": 25.6,
        "running": true
      }
    }
  ]
}
```

::: tip
键名使用点位 `point_key`。建议在建模阶段保持 `point_key` 稳定且平台友好。
:::

---

## 3. Attributes JSON 形状

Attributes 使用 client-side attributes publish 形状：

```json
{
  "Device-A": {
    "serial": "A10086",
    "fw": "1.0.0"
  }
}
```

当前实现中仅发布 `client_attributes`（平台/场景若需要 shared/server 语义，需要后续扩展）。

---

## 4. Connect / Disconnect

设备上下线事件：

```json
{
  "device": "Device-A",
  "type": "pump-v1"
}
```

---

## 5. Protobuf（当前不支持）

虽然配置项支持 `message_format=protobuf`，但当前实现会返回错误。  
见：[`Protobuf 状态说明`](/northward/thingsboard/protobuf-status)

<!-- TODO screenshot: tb-ui-telemetry -->

