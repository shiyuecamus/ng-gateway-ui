---
title: 'RPC 与 Attributes 下行'
description: 'ThingsBoard 插件订阅的下行 topic、闭环链路、payload 形状，以及如何把平台 RPC/Attributes 变成网关侧事件并写回。'
---

## 1. 下行 topic 一览

当前实现会订阅：

### 1.1 Device API（发给网关自身 device）

- **Attributes 变更通知（gateway device shared attributes changed，仅日志）**：`v1/devices/me/attributes`
- **Attributes response（当前未使用）**：`v1/devices/me/attributes/response/+`
- **Gateway-level RPC request**：`v1/devices/me/rpc/request/+`
- **Gateway-level RPC response（当前未使用）**：`v1/devices/me/rpc/response/+`

### 1.2 Gateway API（发给网关作为 TB Gateway）

- **Sub-device RPC request**：`v1/gateway/rpc`
- **Sub-device shared attributes changed（映射为 WritePoint）**：`v1/gateway/attributes`

:::: warning 重要说明
你可能在 TB 文档里见过 `v1/gateway/attributes/request` / `v1/gateway/attributes/response` 等 topic，但当前插件版本 **不会订阅**它们，也不会走 attributes request/response 语义。对 ng-gateway 而言，attributes 下行更推荐用“desired/reported”闭环（见本文第 4 节）。
::::

---

## 2. 处理流程

从 TB 到网关内部事件，再到写回的时序如下：

1. supervisor 建立 MQTT 连接
2. 收到 ConnAck 后订阅上述 topic，订阅成功即 Ready
3. event loop 收到 Publish → router 按 topic 分发给 handler
4. handler 解析 payload → 生成 `NorthwardEvent`
5. core 统一处理事件，必要时产出响应：
   - RPC 产出 `NorthwardData::RpcResponse` → ThingsBoard 插件发布 MQTT 响应
   - 写点产出 `NorthwardData::WritePointResponse` → **当前仅日志，不写回 TB**

---

## 3. RPC 下行：请求/映射/响应（闭环）

### 3.1 Sub-device RPC（TB → 网关 → 现场设备）

#### 订阅 topic

- `v1/gateway/rpc`

#### 请求 payload（实现对齐）

```json
{
  "device": "Device-A",
  "data": {
    "id": 1,
    "method": "setValve",
    "params": { "open": true }
  }
}
```

#### 网关内部事件映射

- 生成 `NorthwardEvent::CommandReceived`
- 映射要点：
  - `command_id = data.id.to_string()`
  - `key = data.method`
  - `params = data.params`
  - `target_type = SubDevice`
  - `device_name = device`

#### 响应写回（实现对齐）

当 core 处理完成并产出 `NorthwardData::RpcResponse` 后，插件会 publish 回 **同一个 topic**：

- `v1/gateway/rpc`

成功时（推荐带 `result`）：

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

失败时：

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

:::: warning 关于 request id 的类型
TB 的 `id` 是整数。ng-gateway 内部为了通用性使用 String request_id，但写回 TB 时必须是 **数字**。因此：

- **推荐**：平台侧始终使用数字 id（上例的 `1`），网关侧会把它当作字符串透传并在写回时解析为数字。
- **不推荐**：自定义非数字 request_id（会导致写回时被丢弃）。
::::

### 3.2 Gateway-level RPC（TB → 网关本体）

#### 订阅 topic

- `v1/devices/me/rpc/request/+`

例如：`v1/devices/me/rpc/request/42`

#### 请求 payload（实现对齐）

```json
{
  "method": "reboot",
  "params": { "delay_sec": 3 }
}
```

#### 网关内部事件映射

- 生成 `NorthwardEvent::CommandReceived`
- `command_id` 来自 topic 的最后一段（例如 `42`）
- `target_type = Gateway`
- `device_name` 固定为 `"gateway"`（用于内部可观测性）

#### 响应写回（实现对齐）

插件会 publish 到：

- `v1/devices/me/rpc/response/<request_id>`

成功时：payload 取 `RpcResponse.result`（若为空，则写 `{ "success": true }`）。

失败时：

```json
{
  "success": false,
  "error": "reason"
}
```

---

## 4. Attributes 下行：最佳实践闭环（desired/reported）

### 4.1 订阅 topic

- **子设备共享属性变更（用于控制面写点）**：`v1/gateway/attributes`
- **网关自身 device 属性变更（当前仅日志，不参与控制面）**：`v1/devices/me/attributes`

### 4.2 请求 payload（实现对齐）

对 **子设备共享属性变更**，ThingsBoard 会推送：

```json
{
  "device": "Device-A",
  "data": {
    "setpoint": 12.34,
    "enable": true
  }
}
```

然后进行 best-effort 映射：

- 在网关运行时元数据中查找匹配点位：`device_name == device && point_key == key`
- 找到后转成 `WritePoint` 并发给 core 执行写点

对 **网关自身 device 属性变更**（`v1/devices/me/attributes`），TB 通常推送的是一个普通 JSON map，例如：

```json
{
  "attribute1": "value1",
  "attribute2": 42
}
```

当前实现会记录日志，但不会将其映射为写点（避免误把网关配置面与控制面耦合）。

### 4.3 为什么 Attributes 不走 response topic

TB 的 attributes request/response 语义更偏向“读属性”；而生产控制更常见的是“设置期望状态”。对网关而言，最稳健的闭环是：

- **desired**：平台写 shared attributes（例如 `desired.enable=true`）
- 网关收到变更 → 写点
- **reported**：网关再把现场实际状态通过上行 telemetry/attributes 回报（例如 `reported.enable=true` 或直接用点位 telemetry）

这样闭环在数据模型层完成，天然支持断链重连与最终一致。

---

## 5. 实现状态与当前限制（你提到的“完善闭环”重点）

### 5.1 已实现

- RPC request → `CommandReceived` → core → `RpcResponse` → MQTT 回包（Sub-device RPC 与 Gateway-level RPC 都支持）
- Attributes changed → best-effort 映射 `WritePoint`（按 `device_name + point_key` 匹配点位元数据）

### 5.2 当前未实现/未启用（需要补齐时的改造点）

- `v1/devices/me/attributes/response/+`：handler 当前为空实现（收到会忽略）
- `v1/devices/me/rpc/response/+`：handler 当前为空实现（收到会忽略）
- 写点结果写回 TB：`WritePointResponse` 当前只记录日志，不向 TB 回传（建议用 RPC 或 reported 状态闭环）

### 5.3 写点闭环（产品化落地建议）

如果你的业务明确需要“平台发起写点后拿到成功/失败”，建议 **不要**依赖 TB attributes-response，而是采用以下两种之一：

#### 方案 A：用 RPC 承载写点并回包（强闭环）

- 平台发起 server-side RPC
- 网关把 RPC 映射成内部写点（由你的命令处理层完成映射）
- 网关将写点结果通过 `RpcResponse` 回包（本文第 3 节）

示例（建议约定，供落地参考）：

```json
{
  "device": "Device-A",
  "data": {
    "id": 1,
    "method": "write_point",
    "params": {
      "point_key": "setpoint",
      "value": 12.34
    }
  }
}
```

#### 方案 B：Attributes desired/reported（最终一致）

- 平台写 shared attributes：`desired.*`
- 网关执行写点后，将实际状态通过上行 telemetry/attributes 回报：`reported.*`
- 平台侧用规则引擎或 dashboard 以 reported 作为“完成态”

