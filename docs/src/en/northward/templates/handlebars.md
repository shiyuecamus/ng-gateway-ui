---
title: 'Template Syntax (Handlebars)'
description: 'Northward uplink topic/key supports Handlebars template syntax; this article explains syntax, default behavior, and common pitfalls.'
---

## 1. Scope

Current template rendering is used for:

-   **uplink topic** (e.g., Kafka/Pulsar `uplink.*.topic`)
-   **uplink key/partition key** (e.g., Kafka record key / Pulsar partition_key)

::: warning Not Applicable Scope (Must Remember)
**downlink topic must be exact topic**, does not support template/wildcard/regex.
Reason: To maintain operable, predictable subscription behavior (Avoid wildcard introducing uncontrollable fan-in).
See: [`Downlink Overview`](/northward/downlink/overview)
:::

---

## 2. Basic Syntax

Template variables use <code v-pre>{{var}}</code>:

```text
ng.uplink.{{event_kind}}.{{device_name}}
```

Template engine uses Handlebars, and:

-   **Non-strict mode**: Missing variables do not error, but render as empty string
-   **No HTML escaping**: topic/key is plain text

::: warning Common Pitfall: Missing variable causes topic/key to be empty
If you write <code v-pre>{{channel_name}}</code>, but current data type cannot get `channel_name`, it becomes an empty string.
Recommend using `default` helper to provide fallback value (See below).
:::

---

## 3. `default` helper

Syntax:

```text
{{default value "fallback"}}
```

Example:

```text
ng.uplink.{{event_kind}}.{{default device_type "unknown"}}.{{device_name}}
```

When `value` does not exist, is `null`, or is an empty string, `fallback` will be used.

---

## 4. Where do template variables come from

Template variables come from runtime RenderContext. Available fields vary slightly by event type. Full variable table see:

-   [`Template Variable Table`](/northward/templates/variables)

---

## 5. Recommended topic/key Planning

### 5.1 topic used to express "Routing Dimension"

Prioritize putting "Routing/Isolation" dimension on topic, e.g.:

```text
ng.uplink.{{event_kind}}.{{device_name}}
```

Or split by business domain/tenant (If you did isolation at App layer):

```text
tenant.{{app_id}}.ng.uplink.{{event_kind}}.{{device_name}}
```

### 5.2 key used to express "Partition & Ordering"

Kafka/Pulsar key/partition_key affects partitioning:

-   Want ordering by device: <code v-pre>{{device_id}}</code> or <code v-pre>{{device_name}}</code>
-   Want ordering by point: Usually not recommended (Partitioning too fine affects throughput)

Deeper suggestions:

-   Kafka: [`Partition & Ordering (Kafka)`](/northward/kafka/partitions)
-   Pulsar: [`Partition & Ordering (Pulsar)`](/northward/pulsar/partitions)
