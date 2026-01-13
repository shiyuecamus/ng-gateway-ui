---
title: 'OPC UA NodeId：语法与获取方式'
description: 'OPC UA NodeId 的常见形式（ns=;s=/i=/g=/b=），以及如何从 KEPServerEX/Prosys/ Ignition 等 Server 浏览并确定点位。'
---

## NodeId 是什么

NodeId 是 OPC UA 信息模型中对节点（变量/对象/方法等）的唯一标识。NG Gateway 的 OPC UA Point/Action 使用 `nodeId` 字符串表示要读写的节点。

## 常见 NodeId 形式

常见写法（以 `opcua` crate 解析为准）：

- **字符串标识**：`ns=2;s=Channel1.Device1.Tag1`
- **数值标识**：`ns=2;i=12345`
- **GUID 标识**：`ns=2;g=550e8400-e29b-41d4-a716-446655440000`
- **ByteString 标识**：`ns=2;b=...`

其中：

- `ns`：namespace index（命名空间索引）
- `s/i/g/b`：identifier type

## 如何获取正确的 NodeId（建议流程）

### 1) 先确认 endpoint 与安全策略

在 Server 管理界面或 UA 客户端工具中（UAExpert、Prosys Client）确认：

- endpoint URL（通常是 `opc.tcp://host:4840`）
- 支持的 `SecurityPolicy` / `SecurityMode`
- 是否需要用户名密码/证书

### 2) 用 UA 客户端工具浏览树

推荐：

- UAExpert（跨平台）
- Prosys OPC UA Browser（跨平台）

在 Browse 树中找到目标变量（Variable Node），查看其 NodeId。

### 3) 用“稳定标识”优先

最佳实践：

- 尽量使用 `s=` 的稳定路径形式（例如 KEPServerEX 的 Tag Path），避免 `i=` 在重启/配置变更后发生漂移（取决于 Server 实现）。

### 4) 校验 DataType 与采集模式

在 UA 客户端里确认变量的：

- UA DataType（Boolean/Int32/Double/String/DateTime/ByteString 等）
- 是否允许订阅（MonitoredItem）
- 是否允许写入（AccessLevel）

这些信息直接决定：

- Point 的 `data_type` 应该如何选择
- Channel 的 `readMode` 选择 Subscribe 还是 Read

## 常见错误

- **ns 不对**：同名节点在不同 namespace 下会是不同 NodeId。
- **把方法节点当变量节点**：方法（Method）需要 call，不是 read value；当前驱动主要覆盖变量读写。
- **数组节点**：当前版本不支持数组 Variant；建议在 Server 侧拆成多个标量节点或提供标量映射。


