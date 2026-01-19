---
title: 'Provision（自动注册/凭据获取）'
description: 'ThingsBoard Provision 工作原理、TB 侧配置要点、重试语义、凭据持久化位置与排障。'
---

## 1. Provision 解决什么问题

当你不想在网关侧手工配置 token/账号，而希望网关“启动后自动获取凭据”时，可以使用 Provision。

插件会：

1. 连接到 TB 的 provision MQTT broker（通常同 host/port）
2. 订阅 `/provision/response`
3. 发布 `/provision/request`
4. 等待响应并提取凭据
5. 将凭据持久化到 extension storage（下次启动复用）

---

## 2. 你需要在 ThingsBoard 侧准备什么

你需要在 TB 中配置 Device Profile 或 Provision 配置，获得：

- `provision_device_key`
- `provision_device_secret`
- 选择 `provision_method`（AccessToken/MqttBasic/X509）

<!-- TODO screenshot: tb-provision-config -->

::: tip device_name 的来源
当前实现中，ProvisionRequest 的 `device_name` 使用 **App 名称**（app_name）。  
因此建议：把 App 命名为你期望在 TB 中出现的网关名（稳定、可运维）。
:::

---

## 3. 重试与超时语义（实现对齐）

Provision 配置字段：

- `timeout_ms`：**整个 provision 流程**的总超时
- `max_retries`：最大重试次数
  - `0` 表示无限重试（直到总超时耗尽）
  - `1` 表示只尝试一次（失败立即返回）
- `retry_delay_ms`：重试间隔

::: warning
即使 `max_retries=0`，也会受 `timeout_ms` 约束，超时后会返回 Timeout。
:::

---

## 4. 凭据持久化（重要）

Provision 成功后，凭据会被存入 extension storage（key：`provision_credentials`）。  
这意味着：

- 重启后会尝试复用已有凭据
- 如果你更换了 TB 侧配置或希望重新 provision，需要清理该存储项（按项目的配置管理能力决定）

---

## 5. 常见排障

- **一直超时**：检查 TB 是否启用了 provision、端口是否可达、ACL/防火墙
- **NotFound/Failure**：device key/secret 不匹配，或 profile 未开启对应 method
- **证书模式失败**：确认 TB 返回的证书字段格式（certificate/privateKey）与网关解析一致

