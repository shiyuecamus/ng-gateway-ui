---
title: 'Pulsar Uplink'
description: 'Pulsar uplink: Event switch, topic/key template, payload mode, and default behavior of batching/compression.'
---

## 1. Uplink Configuration Structure

Located at `config.uplink`:

-   `enabled`: Master switch (Default true)
-   `producer`: Producer parameters (compression/batching)
-   Event mapping: `deviceConnected/deviceDisconnected/telemetry/attributes`

Each mapping:

| Field | Description |
| :--- | :--- |
| `topic` | Pulsar topic template (Handlebars) |
| `key` | partition_key template (Handlebars), if empty not set |
| `payload` | EnvelopeJson/Kv/TimeseriesRows/MappedJson |

---

## 2. Default topic/key

-   `topic`: <code v-pre>persistent://public/default/ng.uplink.{{event_kind}}.{{device_name}}</code>
-   `key`: <code v-pre>{{device_id}}</code>

Template syntax see:

-   [`Template Syntax (Handlebars)`](/northward/templates/handlebars)
-   [`Template Variable Table`](/northward/templates/variables)

---

## 3. Producer Parameters

| Field | Default | Description |
| :--- | :--- | :--- |
| `compression` | `lz4` | `none/lz4/zlib/zstd/snappy` |
| `batchingEnabled` | true | Whether to enable batching (Default off, avoid "Latency/Order" surprise for new users) |
| `batchingMaxMessages` | 1000 | Effective when batching enabled |
| `batchingMaxBytes` | 131072 | Effective when batching enabled (128KiB) |
| `batchingMaxPublishDelayMs` | 10 | Effective when batching enabled |

::: tip
Recommend enabling batching for high throughput scenarios; keep off or reduce publish delay for low latency scenarios.
:::

---

## 4. Properties and Event Time

Pulsar uplink will:

-   `partition_key`: From rendered key
-   `properties`: Carry RenderContext key-values (For diagnosis/filtering)
-   `event_time`: Use millisecond timestamp (Telemetry/Attributes use collection time)
