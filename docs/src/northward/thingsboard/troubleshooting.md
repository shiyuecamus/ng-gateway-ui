---
title: 'ThingsBoard 排障'
description: 'ThingsBoard 常见问题定位：连接失败、token/证书、Provision 超时、平台 UI 无数据、RPC 不生效。'
---

## 1. 连接失败（Failed）

优先检查：

- host/port 是否正确（1883/8883）
- token 是否有效、是否绑定了正确实体
- TLS：证书路径是否可访问、CA 是否可信

见：[`连接模式与参数`](/northward/thingsboard/connection-modes)

---

## 2. Provision 一直超时

- TB 是否启用了 provision
- device key/secret 是否正确
- 防火墙/ACL 是否阻断了 `/provision/*` topic

见：[`Provision`](/northward/thingsboard/provision)

---

## 3. TB UI 看不到 telemetry/attributes

检查顺序：

1. AppSubscription 是否创建
2. 平台侧是否在正确的 Gateway 实体下查看
3. payload 是否符合 TB Gateway API 形状（见 uplink-format）

---

## 4. RPC/Attributes 下行不生效

- 是否订阅成功（连接建立后会订阅一组 topic）
- 平台下发的 topic 是否与订阅匹配
- handler 是否能解析 payload（格式/字段）

