---
title: 'ThingsBoard（北向插件）'
description: '对接 ThingsBoard 平台：支持 Gateway Telemetry/Attributes/Connect/Disconnect，上行与 RPC/Attributes 下行；支持 Provision 与凭据持久化。'
---

## 1. 适用场景

- 你使用 ThingsBoard 做设备管理/可视化/规则引擎
- 希望网关作为 TB Gateway 上报遥测与属性
- 希望使用 TB 的 RPC/Attributes 下发能力控制现场

---

## 2. 关键能力与限制

::: tip 已实现
- 多种连接模式：Token / UsernamePassword / X509 / Provision
- Provision：会把凭据持久化到 extension storage（重启后复用）
- 上行：Gateway Telemetry、Gateway Attributes、Connect/Disconnect
- 下行：订阅并处理 RPC / Attributes 等业务 topic（转为 NorthwardEvent）
:::

::: warning 当前限制
- `message_format=protobuf` 当前版本未实现（会报错），详见：[`Protobuf 状态说明`](/northward/thingsboard/protobuf-status)
- 当前版本无磁盘断网续传（只内存缓冲）：[`QueuePolicy`](/northward/policies/queue-policy)
:::

---

## 3. 最快跑通（推荐路径）

1. 选择一个连接模式（推荐先用 Token）
2. 创建 App 并配置连接
3. 创建 AppSubscription（订阅设备）
4. 在 ThingsBoard UI 验证 telemetry/attributes 是否到达

入口：

- 连接模式：[`连接模式与参数`](/northward/thingsboard/connection-modes)
- 上行格式：[`上行消息格式（TB Gateway API）`](/northward/thingsboard/uplink-format)
- Provision：[`Provision（自动注册/凭据获取）`](/northward/thingsboard/provision)
- 下行：[`RPC 与 Attributes 下行`](/northward/thingsboard/rpc-and-attributes)
- 排障：[`ThingsBoard 排障`](/northward/thingsboard/troubleshooting)

