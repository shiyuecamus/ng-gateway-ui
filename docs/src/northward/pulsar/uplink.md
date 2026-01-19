---
title: 'Pulsar 上行（Uplink）'
description: 'Pulsar uplink：事件开关、topic/key 模板、payload 模式，以及 batching/compression 的默认行为。'
---

## 1. Uplink 配置结构

位于 `config.uplink`：

- `enabled`：总开关（默认 true）
- `producer`：producer 参数（compression/batching）
- 事件 mapping：`deviceConnected/deviceDisconnected/telemetry/attributes`

每个 mapping：

| 字段 | 说明 |
| --- | --- |
| `topic` | Pulsar topic 模板（Handlebars） |
| `key` | partition_key 模板（Handlebars），为空则不设置 |
| `payload` | EnvelopeJson/Kv/TimeseriesRows/MappedJson |

---

## 2. 默认 topic/key（代码默认）

- `topic`：`persistent://public/default/ng.uplink.{{event_kind}}.{{device_name}}`
- `key`：`{{device_id}}`

模板语法见：

- [`模板语法（Handlebars）`](/northward/templates/handlebars)
- [`模板变量表`](/northward/templates/variables)

---

## 3. Producer 参数（`uplink.producer`）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `compression` | `lz4` | `none/lz4/zlib/zstd/snappy` |
| `batchingEnabled` | false | 是否启用 batching（默认关闭，避免新用户遇到“延迟/顺序”惊喜） |
| `batchingMaxMessages` | 1000 | batching 开启后生效 |
| `batchingMaxBytes` | 131072 | batching 开启后生效（128KiB） |
| `batchingMaxPublishDelayMs` | 10 | batching 开启后生效 |

::: tip
高吞吐场景建议开启 batching；低延迟场景保持关闭或减少 publish delay。
:::

---

## 4. Properties 与事件时间

Pulsar uplink 会：

- `partition_key`：来自渲染后的 key
- `properties`：携带 RenderContext 键值（用于诊断/过滤）
- `event_time`：使用毫秒时间戳（Telemetry/Attributes 为采集时间）

