---
title: 'OPC UA Server（北向插件）'
description: '把 NG Gateway 点位暴露为 OPC UA AddressSpace（Objects/NG-Gateway/...），支持订阅读值与 OPC UA Write 写回网关点位。'
---

## 1. 这不是 southward 的 OPC UA

这里的 **OPC UA Server** 是 northward 插件：网关对外提供一个 OPC UA Server。  
它与 southward 的 OPC UA driver（用于采集外部 OPC UA）是两个方向。

---

## 2. 你将得到什么

- 一个可连接的 OPC UA Server（默认绑定 `0.0.0.0:4840`）
- 自动构建节点树：`Objects/NG-Gateway/{channel}/{device}/{point}`
- 把点位值写入 Variable（支持订阅/读）
- 支持 OPC UA Write 写回：
  - 写入 Variable.Value → 触发 `WritePoint` → southward 写入设备

---

## 3. 快速验证

1. 使用 Prosys OPC UA Browser 连接 `opc.tcp://<gateway-host>:4840/`
2. 浏览 `Objects` → `NG-Gateway`
3. 订阅某个点位 variable，观察实时更新
4. （可选）对可写点位执行 Write，观察是否写入成功

![Opcua browse](./assets/opcua-browse.png)

::: warning
点位节点是“按需创建”的：只有被路由到该 App 的点位（或随后在缓存中更新的点位）才会出现。  
请先创建 AppSubscription 并确保有数据上来。
:::

