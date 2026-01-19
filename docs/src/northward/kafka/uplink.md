---
title: 'Kafka 上行（Uplink）'
description: 'Kafka uplink 映射：事件开关、topic/key 模板、payload 模式、producer 参数与 headers。'
---

## 1. Uplink 配置结构

Kafka uplink 位于：

- `config.uplink`

包含：

- `enabled`：总开关（默认 true）
- `producer`：producer 参数（默认启用幂等）
- 按事件类型的 mapping：
  - `deviceConnected`
  - `deviceDisconnected`
  - `telemetry`
  - `attributes`

每个 mapping 形状：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `enabled` | boolean | 是否启用该事件类型 |
| `topic` | string | topic 模板（Handlebars） |
| `key` | string | key 模板（Handlebars），渲染为空则不设置 key |
| `payload` | object | payload 配置（EnvelopeJson/Kv/TimeseriesRows/MappedJson） |

模板语法与变量表：

- [`模板语法（Handlebars）`](/northward/templates/handlebars)
- [`模板变量表`](/northward/templates/variables)

---

## 2. 默认 topic/key（代码默认）

- `topic` 默认：`ng.uplink.{{event_kind}}.{{device_name}}`
- `key` 默认：`{{device_id}}`

::: tip
如果你希望按时间分区写入数据湖，建议把时间维度放到 topic 里（`yyyy/MM/dd/HH`），并保持 key 按设备分区。
:::

---

## 3. Producer 参数（`uplink.producer`）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `enableIdempotence` | true | 是否启用幂等 producer（更强交付语义） |
| `acks` | `all` | `none/one/all` |
| `compression` | `lz4` | `none/gzip/snappy/lz4/zstd` |
| `lingerMs` | 5 | 批处理延迟（ms） |
| `batchNumMessages` | 1000 | 每批最大消息数 |
| `batchSizeBytes` | 131072 | batch.size（128KiB） |
| `messageTimeoutMs` | 30000 | message.timeout.ms |
| `requestTimeoutMs` | 10000 | request.timeout.ms |
| `maxInflight` | 5 | max.in.flight.requests.per.connection |

::: warning 顺序性提示
即使启用幂等，重试发生时仍可能受 `maxInflight` 影响有序性语义。  
如果你对严格顺序非常敏感，请先理解 Kafka 的幂等与 in-flight 语义，再调整这些参数。
:::

---

## 4. Headers（用于可观测性与过滤）

Kafka uplink 会把 RenderContext 的键值对作为 headers 写入（例如 `app_id`、`event_kind`、`device_id` 等）。

用途：

- 平台侧快速诊断与过滤
- downlink 的 `filter.mode=property` 可利用 headers（注意：仅 UTF-8 headers 可被识别）

---

## 5. payload 选型

见：[`上行 Payload 总览`](/northward/payload/overview)

