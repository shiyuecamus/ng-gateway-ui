---
title: '验证清单（北向）'
description: '给现场/运维的可执行清单：如何验证配置、连接、topic、payload、下行与写回。'
---

## 1. 配置验证（静态）

- App 是否启用
- `retryPolicy/queuePolicy` 是否符合预期
- 插件连接字段是否填写完整（host/port/url/token 等）
- uplink/downlink 的 `enabled` 是否正确

---

## 2. 运行验证（动态）

### 2.1 连接状态

- Connected / Connecting / Reconnecting / Failed
- Failed 的 reason 是否可读、是否稳定复现

### 2.2 上行链路

- 是否创建 AppSubscription
- 平台侧能否消费到数据
- payload 是否符合预期（EnvelopeJson/Kv/TimeseriesRows/MappedJson）

### 2.3 下行链路（如启用）

- topic 是否精确匹配
- 使用 EnvelopeJson：`schema_version`、`event.kind`、`payload.data` 是否正确
- 使用 MappedJson：filter 是否匹配、映射规则是否正确

---

## 3. 负载验证（上线前必做）

- 高峰期是否出现大量 dropped
- 平台侧消费变慢时，网关是否仍稳定
- 重连/抖动时是否出现惊群与日志风暴（调 `RetryPolicy`）

