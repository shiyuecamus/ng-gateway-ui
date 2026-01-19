---
title: 'RPC 与 Attributes 下行'
description: 'ThingsBoard 插件订阅的下行 topic、处理流程、如何把平台 RPC/Attributes 变成网关侧事件与写回。'
---

## 1. 插件会订阅哪些 topic（实现对齐）

当前实现会订阅（QoS 使用 `communication.qos()`）：

- Device API：
  - `v1/devices/me/attributes`
  - `v1/devices/me/attributes/response/+`
  - `v1/devices/me/rpc/request/+`
  - `v1/devices/me/rpc/response/+`
- Gateway API：
  - `v1/gateway/attributes`
  - `v1/gateway/attributes/response`
  - `v1/gateway/rpc`

::: tip
这些 topic 是 TB 的标准 API 约定。插件内部会把收到的 Publish 按 topic 路由给不同 handler。
:::

---

## 2. 处理流程（高层）

1. supervisor 建立 MQTT 连接并订阅 topic
2. event loop 收到 Publish → router 分发到 handlers
3. handler 解析 payload → 生成 `NorthwardEvent`（例如 WritePoint/Command/RpcResponseReceived）
4. core 统一做校验、串行化写入并回传响应（视事件类型）

::: warning
具体 payload 形状与事件映射会随 handler 迭代而扩展。本文档落地阶段会补齐“可复制的示例请求与对应事件语义”。
:::

