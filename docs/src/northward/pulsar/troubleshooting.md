---
title: 'Pulsar 排障'
description: 'Pulsar 常见问题定位：serviceUrl/端口、token 权限、TLS、topic/namespace、backlog 与 ack/nack 行为。'
---

## 1. 连接失败（Failed）

- `serviceUrl` 协议与端口是否匹配（`pulsar://6650` / `pulsar+ssl://6651`）
- token 是否有权限（tenant/namespace/topic）
- TLS 握手失败（证书链/hostname）

---

## 2. Connected 但没数据

优先检查：

- AppSubscription 是否存在
- uplink mapping 是否 enabled
- 你是否在正确的 topic 上消费（Pulsar topic 前缀经常容易写错）

---

## 3. 下行不生效

检查顺序：

1. downlink enabled
2. topic 是否精确匹配（不可模板/不可 wildcard）
3. AckPolicy/FailurePolicy 是否导致 ack/nack 与重试行为符合预期
4. MappedJson filter 是否匹配

---

## 4. Backlog 增大/吞吐下降

- consumer 是否跟得上（平台侧 backlog）
- 是否需要开启 batching（吞吐优先）
- `QueuePolicy` 是否合理（遥测建议 Discard）

