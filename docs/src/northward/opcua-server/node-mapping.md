---
title: 'Node 映射与 NodeId 规则'
description: 'OPC UA AddressSpace 层级、NodeId 字符串规则、sanitize 策略，以及“只暴露已订阅点位”的安全边界。'
---

## 1. AddressSpace 层级

根节点：

- `Objects/NG-Gateway`

层级结构：

- `Objects/NG-Gateway/{channel}/{device}/{point}`

其中：

- `{channel}` 使用 `channel_name` 作为 browse name
- `{device}` 使用 `device_name`
- `{point}` 使用 `point_key`

---

## 2. NodeId 规则

每个点位 Variable 的 NodeId 使用 String NodeId：

```text
ns=1;s={channel}.{device}.{point_key}
```

其中每个组件都会进行 sanitize：

- 允许：`[A-Za-z0-9._-]`
- 其它字符统一替换为 `-`

::: warning 重要：不要随意修改 sanitize 策略
一旦修改，客户端侧保存的 NodeId/映射会失效（属于破坏性变更）。
:::

---

## 3. DataType 与 AccessLevel 映射

- Variable `DataType` 映射自点位的 `data_type`
- `AccessLevel` 映射自点位的 `access_mode`：
  - Read → CURRENT_READ
  - Write → CURRENT_WRITE
  - ReadWrite → READ|WRITE

---

## 4. 只暴露“已订阅点位”

当前实现刻意避免“把网关所有点位都暴露出去”：

- 节点会在处理 Telemetry/Attributes 时按需创建（lazy）
- runtime delta（点位增删改）只会更新“已经在本地缓存中存在的点位”

这意味着：

- 未订阅/未路由的数据点，不会突然出现在 OPC UA Server 中
- 你需要先创建 AppSubscription 并确保数据进入该 App

