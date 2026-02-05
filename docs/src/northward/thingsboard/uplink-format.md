---
title: '上行消息格式（TB Gateway API）'
description: 'ThingsBoard 插件上行采用 TB Gateway API 的 MQTT topic 与 JSON payload 形状（telemetry/attributes/connect/disconnect）。'
---

## 1. 上行 topic

ThingsBoard 插件使用 TB Gateway API topic：

- Telemetry：`v1/gateway/telemetry`
- Attributes：`v1/gateway/attributes`
- Connect：`v1/gateway/connect`
- Disconnect：`v1/gateway/disconnect`
- RPC Response（SubDevice）：`v1/gateway/rpc`
- RPC Response（Gateway）：`v1/devices/me/rpc/response/<request_id>`

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

:::: tip
键名使用点位 `point_key`。建议在建模阶段保持 `point_key` 稳定且平台友好。
::::

### 2.1 字段语义

- **设备名（root key）**：例如 `Device-A`，表示 TB 子设备名（sub-device name），来自网关内部 `device_name`。
- **`ts`**：毫秒时间戳（epoch millis）。
- **`values`**：点位键值集合；键名来自点位 `point_key`，值来自 `NGValue` 的 JSON 序列化语义（如 int/bool/string 等）。

### 2.2 `max_payload_bytes` 与自动分块

当一次遥测上报包含的点位很多、或 value 很大（例如长字符串/数组）时，单条 JSON payload 可能超过 broker / 平台限制。插件会对 telemetry 执行 **自动分块**：

- **分块粒度**：按 `values` 中的 key/value 逐个累积
- **刷出（flush）策略**：一旦继续追加会使 bytes 超过 `communication.max_payload_bytes`，就立刻刷出当前 chunk，并开始新的 chunk
- **消息合法性**：每个 chunk 都是一个 **完整且合法** 的 TB Gateway Telemetry JSON（仍然是本节展示的形状）
- **结果形态**：同一批数据可能会发布多条 `v1/gateway/telemetry`

:::: warning 重要澄清
这里的“分片”是 **应用层分块（chunking）**：把一批点位拆成多条 **独立合法消息**。它不是 MQTT 协议层分片，也不依赖 ThingsBoard 的“重组”能力。
::::

详见：[`max_payload_bytes 与分片算法`](/northward/thingsboard/max-payload-bytes-and-chunking)。

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

当前实现中仅发布 `client_attributes`。

### 3.1 Attributes 的分块规则

Attributes 同样受 `communication.max_payload_bytes` 控制，规则与 telemetry 一致：按 key/value 逐个累积，必要时拆成多条 `v1/gateway/attributes` publish。

要点：

- **不会改变 payload 形状**：每条消息仍然是 `{ "<device>": { ... } }`
- **分块粒度**：按 attributes 的 key/value

详见：[`max_payload_bytes 与分片算法`](/northward/thingsboard/max-payload-bytes-and-chunking)。

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

## 5. RPC 响应回包

`RpcResponse` 是 **下行 RPC 闭环**的回包，但从 MQTT 方向看它属于网关向 TB 的 outbound publish。这里给出“上行侧”需要对齐的 topic 与 payload 形状（闭环语义详见：[`RPC/Attributes 下行`](/northward/thingsboard/rpc-and-attributes)）。

### 5.1 Sub-device RPC 回包

- topic：`v1/gateway/rpc`
- payload（成功）：

```json
{
  "device": "Device-A",
  "id": 1,
  "data": {
    "success": true,
    "result": { "applied": true }
  }
}
```

- payload（失败）：

```json
{
  "device": "Device-A",
  "id": 1,
  "data": {
    "success": false,
    "error": "timeout"
  }
}
```

:::: warning
ThingsBoard 的 `id` 是整数。当前实现会尝试把内部 `request_id` 解析为数字；如果不是数字，该回包会被丢弃。
::::

### 5.2 Gateway-level RPC 回包

- topic：`v1/devices/me/rpc/response/<request_id>`
- payload：建议返回任意可序列化 JSON；失败时建议包含 `{ "success": false, "error": "..." }`

---

## 6. Protobuf（当前不支持）

虽然配置项支持 `message_format=protobuf`，但当前实现会返回错误。

如果你对 payload size 和吞吐有更强诉求，优先建议：

- 合理配置 `communication.max_payload_bytes` 并理解分块策略（避免 broker 因超限而断链/报错）
- 控制单次上报点位数（或减少大字段）
- 约束 `point_key` 长度（JSON 键名会显著影响字节数）

---
title: '上行消息格式（TB Gateway API）'
description: 'ThingsBoard 插件上行采用 TB Gateway API 的 MQTT topic 与 JSON payload 形状（telemetry/attributes/connect/disconnect）。'
---

## 1. 上行 topic

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

### 2.1 字段语义（实现对齐）

- **设备名（root key）**：例如 `Device-A`，表示 TB 子设备名（sub-device name），来自网关内部 `device_name`。
- **`ts`**：毫秒时间戳（epoch millis）。
- **`values`**：点位键值集合；键名来自点位 `point_key`，值来自 `NGValue` 的 JSON 序列化语义（如 int/bool/string 等）。

### 2.2 `max_payload_bytes` 与自动分块（Chunking）

当一次遥测上报包含的点位很多、或 value 很大（例如长字符串/数组）时，单条 JSON payload 可能超过 broker / 平台限制。插件会对 telemetry 执行 **自动分块**：

- **分块粒度**：按 `values` 中的 key/value 逐个累积
- **刷出（flush）策略**：一旦继续追加会使 bytes 超过 `communication.max_payload_bytes`，就立刻刷出当前 chunk，并开始新的 chunk
- **消息合法性**：每个 chunk 都是一个 **完整且合法** 的 TB Gateway Telemetry JSON（仍然是本节展示的形状）
- **结果形态**：同一批数据可能会发布多条 `v1/gateway/telemetry`

:::: warning 重要澄清
这里的“分片”是 **应用层分块（chunking）**：把一批点位拆成多条 **独立合法消息**。它不是 MQTT 协议层分片，也不依赖 ThingsBoard 的“重组”能力。
::::

详见：[`max_payload_bytes 与分片算法`](/northward/thingsboard/max-payload-bytes-and-chunking)。

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

当前实现中仅发布 `client_attributes`。

### 3.1 Attributes 的分块规则

Attributes 同样受 `communication.max_payload_bytes` 控制，规则与 telemetry 一致：按 key/value 逐个累积，必要时拆成多条 `v1/gateway/attributes` publish。

要点：

- **不会改变 payload 形状**：每条消息仍然是 `{ "<device>": { ... } }`
- **分块粒度**：按 attributes 的 key/value

详见：[`max_payload_bytes 与分片算法`](/northward/thingsboard/max-payload-bytes-and-chunking)。

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

## 5. RPC 响应回包（RpcResponse）

`RpcResponse` 是 **下行 RPC 闭环**的回包，但从 MQTT 方向看它属于网关向 TB 的 outbound publish。这里给出“上行侧”需要对齐的 topic 与 payload 形状（闭环语义详见：[`RPC/Attributes 下行`](/northward/thingsboard/rpc-and-attributes)）。

### 5.1 Sub-device RPC 回包（Gateway API）

- topic：`v1/gateway/rpc`
- payload（成功）：

```json
{
  "device": "Device-A",
  "id": 1,
  "data": {
    "success": true,
    "result": { "applied": true }
  }
}
```

- payload（失败）：

```json
{
  "device": "Device-A",
  "id": 1,
  "data": {
    "success": false,
    "error": "timeout"
  }
}
```

:::: warning
ThingsBoard 的 `id` 是整数。当前实现会尝试把内部 `request_id` 解析为数字；如果不是数字，该回包会被丢弃。
::::

### 5.2 Gateway-level RPC 回包（Device API）

- topic：`v1/devices/me/rpc/response/<request_id>`
- payload：建议返回任意可序列化 JSON；失败时建议包含 `{ "success": false, "error": "..." }`

---

## 6. Protobuf（当前不支持）

虽然配置项支持 `message_format=protobuf`，但当前实现会返回错误。

如果你对 payload size 和吞吐有更强诉求，优先建议：

- 合理配置 `communication.max_payload_bytes` 并理解分块策略（避免 broker 因超限而断链/报错）
- 控制单次上报点位数（或减少大字段）
- 约束 `point_key` 长度（JSON 键名会显著影响字节数）