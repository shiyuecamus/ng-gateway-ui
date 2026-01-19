---
title: '常见错误与处理建议'
description: '把“错误现象”映射到“可操作的下一步”：认证失败、topic 无权限、队列满、payload 解码失败、下行 poison message 等。'
---

## 1. 连接失败类

### 1.1 认证失败（SASL/Token/UserPass）

典型表现：

- App 状态 Failed，reason 包含 `auth`/`unauthorized`/`invalid credentials`

建议处理：

- 先用平台自带 CLI/工具验证凭据（排除网关侧问题）
- Kafka：检查 SASL 机制、用户名密码、ACL（topic 权限）
- Pulsar：token 是否过期、tenant/namespace/topic 权限
- ThingsBoard：token/username/password 是否正确；Provision key/secret 是否匹配 profile

### 1.2 TLS/证书问题

典型表现：

- handshake failed / certificate verify failed

建议处理：

- 证书路径是否正确（容器内路径 vs 宿主机路径）
- CA 是否完整（中间证书）
- 是否启用了 hostname verification（Kafka `ssl.endpoint.identification.algorithm`）

---

## 2. 数据不出/出错类

### 2.1 “Connected 但没数据”

优先检查：

- AppSubscription 是否存在
- uplink mapping 是否 enabled
- topic 是否渲染为空（模板变量缺失）

### 2.2 payload 解码/映射失败（downlink）

典型表现：

- 下行消息存在但不执行
- 日志出现 decode/mapping 错误

建议处理：

- EnvelopeJson：检查 `schema_version` 与 `event.kind`
- MappedJson：先确保 filter 能匹配，再检查映射规则
- poison message：生产建议 `ack_policy=on_success + failure_policy=drop`，避免卡住

---

## 3. 队列满/背压类

典型表现：

- `QueueFull` / `outbound queue rejected`
- 平台侧 lag/backlog 增大

建议处理：

- 拆分 App（关键链路与遥测）
- 提高 `QueuePolicy.capacity`（但不要无脑无限放大）
- 遥测使用 `dropPolicy=Discard`
- 检查平台侧消费能力与分区设计

