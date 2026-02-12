---
title: 'Kafka Uplink Configuration & Payload'
description: 'Kafka uplink mapping: Event switch, topic/key template, payload mode, producer parameters and headers.'
---

## 1. Uplink Configuration Structure

Kafka uplink is located at:

-   `config.uplink`

Contains:

-   `enabled`: Master switch (Default true)
-   `producer`: Producer parameters (Default enables idempotence)
-   Mapping by event type:
    -   `deviceConnected`
    -   `deviceDisconnected`
    -   `telemetry`
    -   `attributes`

Each mapping shape:

| Field | Type | Description |
| :--- | :--- | :--- |
| `enabled` | boolean | Whether to enable this event type |
| `topic` | string | Topic template (Handlebars) |
| `key` | string | Key template (Handlebars), if rendered empty then key is not set |
| `payload` | object | Payload configuration (EnvelopeJson/Kv/TimeseriesRows/MappedJson) |

Template syntax and variable table:

-   [`Template Syntax (Handlebars)`](/northward/templates/handlebars)
-   [`Template Variable Table`](/northward/templates/variables)

---

## 2. Default topic/key

-   `topic` default: <code v-pre>ng.uplink.{{event_kind}}.{{device_name}}</code>
-   `key` default: <code v-pre>{{device_id}}</code>

::: tip
If you want to write to data lake partitioned by time, suggest putting time dimension into topic (`yyyy/MM/dd/HH`), and keep key partitioned by device.
:::

---

## 3. Producer Parameters

| Field | Default | Description |
| :--- | :--- | :--- |
| `enableIdempotence` | true | Whether to enable idempotent producer (Stronger delivery semantics) |
| `acks` | `all` | `none/one/all` |
| `compression` | `lz4` | `none/gzip/snappy/lz4/zstd` |
| `lingerMs` | 5 | Batch delay (ms) |
| `batchNumMessages` | 1000 | Max messages per batch |
| `batchSizeBytes` | 131072 | batch.size (128KiB) |
| `messageTimeoutMs` | 30000 | message.timeout.ms |
| `requestTimeoutMs` | 10000 | request.timeout.ms |
| `maxInflight` | 5 | max.in.flight.requests.per.connection |

::: warning Ordering Hint
Even if idempotence is enabled, ordering semantics may still be affected by `maxInflight` when retries occur.
If you are very sensitive to strict ordering, please understand Kafka's idempotence and in-flight semantics before adjusting these parameters.
:::

---

## 4. Headers

Kafka uplink will write key-value pairs from RenderContext as headers (e.g., `app_id`, `event_kind`, `device_id`, etc.).

Usage:

-   Platform side quick diagnosis and filtering
-   Downlink `filter.mode=property` can utilize headers (Note: Only UTF-8 headers can be recognized)

---

## 5. Payload Selection

See: [`Uplink Payload Overview`](/northward/payload/overview)
