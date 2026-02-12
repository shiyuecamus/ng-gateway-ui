---
title: 'Uplink Payload Overview'
description: 'Northward uplink supports four payloads: EnvelopeJson, Kv, TimeseriesRows, MappedJson. This article gives selection and precautions.'
---

## 1. Which one should you choose

| Mode | Applicable Scenario | Pros | Cons/Notes |
| :--- | :--- | :--- | :--- |
| **EnvelopeJson** (Default Recommended) | Long-term integration, version evolution, mixed events (Telemetry/Attributes/Online/Offline etc.) | **Stable Semantics**, Extensible, Easy to troubleshoot | Relatively larger volume (Field name repetition) |
| **Kv** | Only care about Telemetry/Attributes, want more "Compact Readable" | Simple structure `{ts_ms, values}` | Currently only applicable to Telemetry/Attributes; Recommend not using for device online/offline events |
| **TimeseriesRows** | Data Lake/TSDB ingestion (Row-based) | Easy for batch write, easy to table | Output is array, platform side needs to handle by row |
| **MappedJson** | Platform field/structure mismatch, need declarative transformation | Transform without writing code | Need to understand JMESPath; Readability drops when rules are complex |

::: tip Rule of Thumb
-   Initial Integration: Use **EnvelopeJson** (Easiest to troubleshoot)
-   Pursue Throughput/Lake Ingestion: Use **TimeseriesRows** or **Kv**
-   Need to integrate platform custom structure: Use **MappedJson**
:::

---

## 3. Relationship with Template/Partition

payload is responsible for "What the message body looks like", topic/key is responsible for "Where the message goes, how to partition":

-   Template Syntax: [`Template Syntax (Handlebars)`](/northward/templates/handlebars)
-   Template Variables: [`Template Variable Table`](/northward/templates/variables)
