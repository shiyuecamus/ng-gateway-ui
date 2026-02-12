---
title: 'Pulsar Partition & Throughput (partition_key)'
description: 'How partition_key affects partition and ordering; trade-offs between topic planning, batching and queue strategy.'
---

## 1. Role of partition_key

Pulsar's `partition_key` is similar to Kafka's record key:

-   Messages with same key will be routed to same partition (Depends on topic type and routing strategy)
-   Affects "Ordering within Device" and "Parallel Throughput"

Recommend default partitioning by device:

```text
{{device_id}}
```

---

## 2. Throughput Tuning Suggestions

-   Confirm platform side backlog first (Can consumer keep up)
-   Enable batching for high throughput scenarios (See uplink producer parameters)
-   Protect gateway stability with `QueuePolicy.dropPolicy=Discard` (Telemetry link)

See:

-   [`Pulsar Uplink`](/northward/pulsar/uplink)
