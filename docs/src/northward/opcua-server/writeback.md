---
title: '写回链路与状态码映射'
description: 'OPC UA Write 如何转换为网关 WritePoint，并等待 WritePointResponse；错误如何映射为 OPC UA StatusCode。'
---

## 1. 写回链路

当 OPC UA 客户端对某个点位 Variable 执行 Write：

1. server 仅允许写 `AttributeId::Value`
2. 根据 NodeId 反查 point_id
3. 校验点位是否可写（access_mode = Write/ReadWrite）
4. 进行类型严格匹配（Variant 类型必须与 point data_type 对应）
5. 发送 `NorthwardEvent::WritePoint` 到 core（带 timeout_ms）
6. 等待 `NorthwardData::WritePointResponse`
7. 成功则更新 AddressSpace 中该变量的值，并通知订阅者

---

## 2. 类型匹配

当前写回是严格类型匹配，不做“字符串转数字”等自动转换。

示例：

- point.data_type = `Float64` → Write 必须是 OPC UA `Double`
- point.data_type = `Boolean` → Write 必须是 OPC UA `Boolean`

::: warning
如果客户端写入类型不匹配，会返回 `BadTypeMismatch`（或 `BadInvalidArgument`）。
:::

---

## 3. 错误到 StatusCode 的映射

| 网关错误 | 典型原因 | StatusCode（示意） |
| --- | --- | --- |
| NotFound(node_id/point) | NodeId 不存在或点位已删除 | `BadNodeIdUnknown` |
| NotFound(action) | 点位存在但无对应写入 action | `BadNotWritable` |
| NotConnected | 设备/通道未连接 | `BadNotConnected` |
| Timeout | 写入超时（队列等待或 driver 超时） | `BadTimeout` |
| ValidationFailed(type mismatch) | 类型不匹配 | `BadTypeMismatch` |
| ValidationFailed(out of range) | 超出范围 | `BadOutOfRange` |
| ValidationFailed(not writeable) | 不可写点位 | `BadUserAccessDenied` |

---

## 4. 写入超时

配置项：

- `writeTimeoutMs`（默认 5000）

它会约束：

- core 内写入串行队列的等待
- southward driver 的写入超时
