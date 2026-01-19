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

## 3. 目录导航

- 节点映射：[`Node 映射与 NodeId 规则`](/northward/opcua-server/node-mapping)
- 安全与证书：[`安全与证书（PKI / trusted_client_certs）`](/northward/opcua-server/security)
- 写回：[`写回链路与状态码映射`](/northward/opcua-server/writeback)
- 性能与丢弃策略：[`性能调优（update queue）`](/northward/opcua-server/performance)
- 排障：[`OPC UA Server 排障`](/northward/opcua-server/troubleshooting)

---

## 4. 快速验证（UAExpert）

1. 使用 UAExpert 连接 `opc.tcp://<gateway-host>:4840/`
2. 浏览 `Objects` → `NG-Gateway`
3. 订阅某个点位 variable，观察实时更新
4. （可选）对可写点位执行 Write，观察是否写入成功

<!-- TODO screenshot: opcua-browse -->

::: warning
点位节点是“按需创建”的：只有被路由到该 App 的点位（或随后在缓存中更新的点位）才会出现。  
请先创建 AppSubscription 并确保有数据上来。
:::

