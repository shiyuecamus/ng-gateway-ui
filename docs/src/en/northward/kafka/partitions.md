---
title: 'Kafka Partition, Idempotency & Throughput Tuning'
description: 'How to choose key to determine partition and ordering; significance of idempotent producer; tuning strategies for batch/linger/compression.'
---

## 1. Partition and Key: What are you trading off

Kafka's parallelism comes from partitions, and the key you choose determines "Messages with same key land in same partition".

Common Goals:

-   **Order by Device**: key = <code v-pre>{{device_id}}</code> (Recommended Default)
-   **Max Parallelism**: key is empty or more evenly hashed (But order within device is not guaranteed)

::: tip Recommendation
For most IoT scenarios, ordering by device is the most reasonable balance: Status/Telemetry of the same device is easier to be correctly interpreted by platform side.
:::

---

## 2. Idempotent Producer

Kafka plugin enables idempotent producer by default (`enableIdempotence=true`).

Function:

-   Minimize risk of duplicate writes during retries caused by network jitter (Stronger delivery semantics)

Note:

-   Idempotence is not equivalent to "End-to-End Exactly-Once" (Platform side still needs idempotent consumption)

---

## 3. Throughput Tuning

### 3.1 Confirm Platform Side Consumption Capability First

If consumer cannot keep up, tuning producer side will only cause backlog.

### 3.2 Tune batch/linger/compression

-   `lingerMs`: Improve throughput but increase latency
-   `batchSizeBytes` / `batchNumMessages`: Improve throughput but increase memory usage
-   `compression`: Compression saves bandwidth but consumes CPU
