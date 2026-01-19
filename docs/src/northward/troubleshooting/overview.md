---
title: '北向排障索引'
description: '按症状快速定位：不出数据、topic 不对、队列满、认证失败、下行不生效、OPC UA 看不到节点等。'
---

## 1. 排障总原则（先做这三步）

1. **确认订阅**：是否创建了 `AppSubscription`（没订阅=一定没数据）
2. **确认连接**：App 连接状态是否 Connected/Failed（Failed 先修连接）
3. **确认 topic 与 payload**：topic 是否渲染正确？payload 是否符合消费侧预期？

---

## 2. 常见症状 → 快速定位

### 2.1 App 显示 Connected，但平台侧没有数据

- 是否启用了对应 uplink mapping（例如 telemetry.enabled）
- topic 是否被渲染为空（模板变量缺失）
- 平台侧是否在正确的 topic 上消费
- `QueuePolicy.dropPolicy=Discard` 是否导致大量丢弃（高负载时）

### 2.2 App 显示 Failed（认证/网络/TLS）

- Kafka：bootstrap servers、SASL/TLS 配置、ACL
- Pulsar：service_url、token、租户/namespace 权限
- ThingsBoard：token/username/password、证书路径、Provision key/secret
- OPC UA Server：端口冲突、证书/PKI、client trust

### 2.3 队列满（QueueFull / outbound queue rejected）

- 主队列 `capacity` 太小
- 平台侧消费变慢（lag/backlog）
- topic 过细导致分区热点
- 混合了高频遥测与关键控制

### 2.4 下行消息发了但网关没执行

- downlink topic 必须精确匹配（不能模板）
- `AckPolicy/FailurePolicy` 是否导致消息被 drop/ignore
- 使用 MappedJson 时 filter 是否匹配
- payload shape 是否正确（event.kind 与 data 字段）

---

## 3. 深入排障入口

- [`验证清单（推荐按顺序）`](/northward/troubleshooting/verify-checklist)
- [`常见错误与处理建议`](/northward/troubleshooting/common-errors)

