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

:::: tip 已实现
- 多种连接模式：Token / UsernamePassword / X509 / Provision
- Provision：会把凭据持久化到 extension storage（重启后复用）
- 上行：Gateway Telemetry、Gateway Attributes、Connect/Disconnect
- 上行保护：`communication.max_payload_bytes` 自动分块（避免单条 publish 超限）
- 下行：RPC / Attributes 订阅与事件映射（RPC 支持闭环回包）
::::

:::: warning 当前限制
- `message_format=protobuf` 当前版本未实现（会报错）
- 写点结果不写回 TB：`WritePointResponse` 当前只记录日志（推荐用 RPC 或 desired/reported 模型闭环）
- `v1/devices/me/attributes/response/+` 与 `v1/devices/me/rpc/response/+` 当前为空实现（收到会忽略）
::::

---
