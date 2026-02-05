---
title: 'OPC UA Server 排障'
description: '常见问题定位：连不上、看不到节点、值不更新、写回失败、证书不信任、端口/endpoint 选择错误。'
---

## 1. 连不上

- 地址是否正确：`opc.tcp://<host>:4840/`
- 端口是否被占用
- 容器端口是否暴露
- 客户端是否选择了正确 endpoint（no_security vs secure）

---

## 2. 看不到任何节点

优先检查：

- 是否创建 AppSubscription（没订阅=不会路由任何点位）
- 是否有 Telemetry/Attributes 数据进入该 App

::: tip
节点是 lazy 创建的：只有“被路由到该 App 的点位”才会出现。
:::

---

## 3. 值不更新 / 订阅没有变化

- update queue 是否在丢弃（系统压力大时）
- 是否订阅了正确的 variable 节点
- 是否存在点位 meta 缺失导致节点未创建（通常会在收到数据后补建）

---

## 4. 写回失败（BadTypeMismatch/BadNotWritable/BadNotConnected）

常见原因：

- 点位 access_mode 不是 Write/ReadWrite
- 客户端写入 Variant 类型不匹配（当前严格类型）
- 设备/通道未连接
- 写入超时（writeTimeoutMs 或 southward 写超时）

见：[`写回链路与状态码映射`](/northward/opcua-server/writeback)

