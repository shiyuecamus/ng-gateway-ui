---
title: 'Northward Architecture Overview'
description: 'NG Gateway Northward Architecture Overview: What is Northward, Plugin/App/AppSubscription mental model, general queue and retry configuration, and roadmap for reliability and data format.'
---

# Northward Architecture Overview

The Northward architecture of NG Gateway is not just "sending data to the cloud", but an industrial-grade data pipeline designed for **High Concurrency**, **Weak Network Environments**, and **Data Consistency**.

This document will help you build the correct mental model of Northward, and understand how data is routed, buffered, batched, and finally delivered to the northward platform.

## What is Northward

Northward is the **Bidirectional Integration Boundary** between the gateway and upper-layer platforms/applications (Gateway ↔ Northward Platform), responsible for reliable interaction of data plane and control/event plane on top of unified internal semantics:

-   **`NorthwardData` (Data Plane)**: "Report Data" like telemetry/status/metrics from Gateway → Northward Platform, requiring **Reliable, Controllable, Observable** delivery.
-   **`NorthwardEvent` (Control/Event Plane)**: "Interaction Events" like commands, configuration changes, subscription/routing changes, connection/session events, ACK/receipts between Northward Platform ↔ Gateway, requiring traceability, rate limiting, retry (idempotent if necessary).

::: tip Goals of Northward
-   **Decouple Platform Differences**: Encapsulate "Platform Protocol/Auth/Topic/API/RPC Shape" within plugins, avoiding core logic being tied to a specific platform (Applicable bidirectionally).
-   **Unified Reliability Semantics**: Handle `NorthwardData` and `NorthwardEvent` with consistent semantics of routing, backpressure, retry, timeout, batching, and confirmation (Ack/Commit), instead of each plugin doing its own thing.
-   **Performance First**: Minimize small packet overhead and invalid copying in high-frequency point and weak network jitter scenarios, ensuring stable and predictable throughput, latency, and resource usage.
:::

:::: warning Design Principle
**Northward only solves "Routing, Delivery/Interaction, Confirmation, Backpressure/Retry, Observability"** (Covering `NorthwardData` and `NorthwardEvent`); do not put southward protocol details, device collection strategies, or field encoding/decoding logic into northward plugins.
::::

## Mental Model

-   **Plugin**: Installable northward adapter artifact (e.g., MQTT/Kafka/ThingsBoard, etc.). Plugin defines "How to connect, send, and receive/subscribe (including command downlink)", but does not contain specific field instance configuration.
-   **App (Northward Application Instance)**: A running instance of a Plugin. You can create multiple Apps for the same plugin (e.g., different tenants, different environments, different topic planning). `App.config` is **Plugin Private Configuration**, while `retry_policy` / `queue_policy` are general policies shared by all Apps.
-   **AppSubscription**: Defines **which devices' data an App subscribes to**, and uses `priority` to express priority when resources are tight. The core router will fan out data to each App according to subscription.

## General Configuration

### App Common Attributes

::: tip Note
-   `App.config` is **Plugin Private Configuration** (Defined/Interpreted by different plugins themselves)
-   `retryPolicy/queuePolicy` are general policies shared by all Apps (Unified semantics implemented by core).
:::

| Field | Type | Description | Suggestion |
| :--- | :--- | :--- | :--- |
| `id` | `number` | App Unique ID (Internal Primary Key) | Internal use only |
| `pluginId` | `number` | Associated Plugin ID | Automatically bound after selecting corresponding plugin |
| `name` | `string` | App Name (Human Readable) | Associate with tenant/environment/usage, keep stable |
| `description` | `string \| null` | Description (Optional) | Record platform side key info (e.g., topic planning/tenant) |
| `config` | `object` | Plugin Private Configuration (Shape decided by plugin) | Use with plugin documentation; avoid missing differences when reusing across environments |
| `retryPolicy` | `RetryPolicy` | General Retry Policy (Connection/Send failure retry, etc.) | Production recommends setting limited times or limited duration |
| `queuePolicy` | `QueuePolicy` | General Queue/Backpressure/Memory Buffer Policy | Isolate configuration for high-frequency telemetry and critical links by App |
| `status` | `Enabled \| Disabled` | Enable Status | Gray release enable/disable facilitates troubleshooting |

### `RetryPolicy`

> `RetryPolicy` is reused by both northward and southward; this page focuses on northward semantics.

| Field | Type | Description | Suggestion |
| :--- | :--- | :--- | :--- |
| `maxAttempts` | `number \| null` | Max retry attempts. `0` means disable retry; `null` means infinite retry; setting to `N` means retry at most `N` times. | Production recommends using limited times or limited duration; do not use infinite retry to mask configuration errors. |
| `initialIntervalMs` | `number` | Initial backoff interval (ms) | 1000~3000 |
| `maxIntervalMs` | `number` | Max backoff interval (ms) | 30000~60000 |
| `multiplier` | `number` | Exponential multiplier (Typical 2.0) | 2.0 |
| `randomizationFactor` | `number` | Jitter factor (±percentage), avoid thundering herd | 0.1~0.3 |
| `maxElapsedTimeMs` | `number \| null` | Max cumulative retry duration (ms), `null` means unlimited | Recommended setting, e.g., 10~30 minutes |

::: warning Note on `maxAttempts=0`
Different components may interpret `0` differently (Commonly "Disable Retry" or "Infinite Retry").
This project (southward driver / northward plugin / collector) uses **Unified Semantics** for `RetryPolicy.maxAttempts`:

-   `maxAttempts = 0`: Disable retry (Stop retry immediately after failure)
-   `maxAttempts = null`: Infinite retry (Use with caution)
-   `maxAttempts = N`: Retry at most `N` times

If you want to express "Infinite/Unlimited", please use `null`, do not use `0`.
:::

### `QueuePolicy`

| Field | Type | Description | Suggestion |
| :--- | :--- | :--- | :--- |
| `capacity` | `number` | Main Queue Capacity (Gateway → Plugin) | Telemetry: Set by throughput budget; Critical Link: Appropriately enlarge |
| `dropPolicy` | `Discard \| Block` | Policy when queue is full | High-frequency Telemetry: Discard; Critical Link: Block |
| `blockDuration` | `number` | Max block duration for Block policy (ms) | 50~500ms (Avoid dragging down hot path) |
| `bufferEnabled` | `boolean` | Whether to enable **Memory Buffer** when plugin is disconnected | Only for short-time jitter, do not use as offline resume |
| `bufferCapacity` | `number` | Memory Buffer Capacity (Count, FIFO) | Rough estimate by "Tolerable Disconnection Window" |
| `bufferExpireMs` | `number` | Buffer expiration time (ms), `0` means no expiration | Recommended setting (e.g., 60s~10min) |

> Roadmap: We plan to evolve offline buffering into user-configurable **`bufferType`** (Memory / Disk WAL / Hybrid), and provide product-level capabilities like quota, cleanup, and replay rate limiting; see **3.1 (Roadmap)** and **3.2 (Strategy Matrix/Recommended Default)** below.

## 1. Uplink Data Flow

**Uplink (Gateway → Northward Platform)**: How data is routed, buffered, batched, and delivered to the northward platform after entering the gateway from southward collection.

It usually carries (`NorthwardData`):

-   **Telemetry**: Telemetry data
-   **Attributes**: Attribute data (client/shared/server attributes)
-   **DeviceConnected**: Device online
-   **DeviceDisconnected**: Device offline
-   **Alarm**: Alarm/Event
-   **RpcResponse**: Device side RPC response
-   **WritePointResponse**: Write point result response

1.  **Normalization**: Data from all southward protocols (Modbus, S7, IEC104, etc.) is first converted to unified internal `NorthwardData` format, containing timestamp, quality, device metadata, etc.
2.  **Routing**: The core router decides "Which northward Apps should this data be delivered to" based on `AppSubscription`, and fans out according to subscription.
3.  **Buffer**: Data enters memory-based asynchronous queue (MPSC Channel / bounded queue), decoupling speed difference between collection and sending; queue capacity and congestion strategy are decided by `QueuePolicy`.
4.  **Batching**: To improve network throughput, the gateway merges multiple small messages into a Batch (e.g., MQTT array payload or Kafka Batch), reducing TCP/IP overhead.
5.  **Dispatch & Ack**: Data is sent to northward plugin, waiting for transport layer confirmation; upon failure, decide retry/discard/block based on `RetryPolicy` and backpressure strategy.

## 2. Downlink Data Flow

**Downlink (Northward Platform → Gateway)**: How platform-side control messages are consumed by plugins, decoded/filtered, converted to events, and executed by core.

It usually carries (`NorthwardEvent`):

-   **WritePoint**: Point write
-   **CommandReceived**: Action/Command issue
-   **RpcResponseReceived**: Platform receipt/interaction event

1.  **Ingress**: Northward plugins listen to their respective protocol's "Downlink Entry", receiving control requests/events (Not just Topic model):
    -   **Kafka/Pulsar**: Subscribe to **Exact Topic** (No template/wildcard/regex) and consume messages (Kafka commit / Pulsar ack/nack).
    -   **ThingsBoard**: Subscribe to MQTT topics agreed by ThingsBoard, processed by router/handlers (MQTT layer ack handled by protocol).
    -   **OPC UA Server**: Receive client OPC UA Write request (Return OPC UA `StatusCode` as receipt).
2.  **Normalization**: Normalize protocol layer input (Kafka record / Pulsar message / MQTT publish / OPC UA write) to unified internal event model `NorthwardEvent` (WritePoint / CommandReceived / RpcResponseReceived).
3.  **Dispatch to Core**: Deliver normalized `NorthwardEvent` to Gateway core via `events_tx` (Plugin -> Core), forming a unified control plane entry.
4.  **Validate & Serialize Execute**: Core performs strong validation on events (NotFound/NotWriteable/TypeMismatch/OutOfRange/NotConnected/QueueTimeout, etc.), and executes strictly serially within Channel's write/action queue, finally calling southward driver (`write_point` / `execute_action`).
5.  **Ack/Response**: Complete final confirmation according to plugin's "Receipt Mechanism".

## 3. Reliability and Backpressure

Reliability of the northward link is not "the more the better", but to improve the delivery success rate of critical data as much as possible **without dragging down the gateway**.

A common misconception is to design "Offline Resume (WAL)" and "Degrade when Queue Full (QoS)" separately. The best practice is to treat them as the same thing: When downstream is **Unreachable** or **Slow**, the gateway needs to answer with the same set of rules:

-   **Which data is worth occupying memory/disk/bandwidth budget?**
-   **Which data should be merged (last), sampled (rate limit), or discarded by timeliness (TTL)?**
-   **How to retransmit after network recovery without squeezing out real-time link?**

### 3.1 Unified Design: Offline Buffer + QoS Degrade + Replay Isolation

Network instability in industrial sites is the norm; meanwhile, "Online but Congested" is often more common than "Completely Disconnected". We plan to unify reliability capabilities into a strategy engine that automatically switches strategy intensity under different operating states.

#### Operating States

-   **Normal (Online and Not Congested)**: Real-time first, minimize extra processing.
-   **Congested (Online but Downstream Slow/Queue Approaching Limit)**: Start executing Merge/Sample/TTL to protect gateway stability.
-   **Offline (Offline/Unreachable)**: Enter offline buffer (Hybrid/DiskWal), and more aggressively "Keep New Discard Old".
-   **Replay (Connection Restored and Backlog Exists)**: Retransmission proceeds under independent budget, **never allowed to squeeze out real-time link**.

#### Unified Processing Pipeline (Same logic covers both "Offline" and "Queue Full")

For each data to be uploaded (Abstracted as `Record{kind,key,ts,payload,priority}`):

1.  **TTL Gate (Discard by Timeliness)**: Data exceeding `maxAgeMs` is directly discarded (Especially Telemetry), and discard reason (expired) is recorded.
2.  **CoalesceLast (Merge by Last)**: Keep only the latest value for the same `key`, avoiding continuous queuing/disk writing of "Expired Process Data".
    -   key suggestion: `(app_id, device_id, point/metric, quality_tag?)` (Specific to data model implementation).
3.  **Sampling / Rate limit**: Sample or rate limit high-frequency Telemetry by window, controlling disk write volume and replay pressure.
4.  **Admission (Memory / WAL / Discard / Block)**: Decide destination based on `bufferType` and current state:
    -   Normal: Prioritize entering memory queue.
    -   Congested: Compress first (2/3), then decide enqueue; trigger discard or overflow to WAL (Hybrid) if necessary.
    -   Offline: Enter WAL (DiskWal/Hybrid) after compression.
5.  **Dispatch / Replay**: Send real-time when online; retransmit according to replay budget after recovery (See 3.2).

#### Design Roadmap: BufferType / WAL / Replay

-   **Configurable `bufferType`**: Provide clear choices for different field constraints
    -   **`Memory`**: Pure memory queue, lowest latency, simple implementation; suitable for scenarios tolerating short-time loss or upstream itself can replay.
    -   **`DiskWal`**: WAL-first (Disk first then send), suitable for critical data prioritizing "Integrity Delivery" (Increases Disk IOPS and End-to-End Latency).
    -   **`Hybrid`**: Real-time link prioritizes memory queue; when disconnected/congested or memory limit reached, data writes to WAL for resume; suitable compromise for "Real-time First + No Loss on Disconnect" (Recommended default target form).
-   **WAL Maintainability**: WAL records have **Validation/Versioning** and crash recovery capabilities, and output "Explainable Discard Reasons" (e.g., Disk Full/Over Quota/Expired/Format Incompatible).
-   **Replay (Offline Resume)**: Replay historical data in FIFO/Time order after network recovery, with **Controllable Rate Limit**, avoiding historical retransmission squeezing out real-time throughput (Real-time/Replay Isolation see 3.2).
-   **Quota and Cleanup**: Provide **Disk Quota (maxBytes / maxSegments) + Expiration Cleanup (TTL)**, ensuring disk is not filled up affecting gateway stability.

:::: warning Current Status
Reliability in the current version mainly relies on **Memory Queue (`QueuePolicy`) + Connection/Send Retry (`RetryPolicy`)**. Disk WAL offline resume and replay mechanism is currently **not fully implemented** (or implementation is still rough), please do not rely on it as a strong commitment capability.
::::

#### Product-Level Best Practice Plan

-   **Capacity Budget**: Estimate buffer demand by "Point Frequency × Single Point Average Size × Target Disconnect Duration", and set reasonable `capacity/bufferCapacity` for App.
-   **Shunt Isolation**: Split critical data and high-frequency telemetry into different Apps (Different Queues/Different Retry Policies) to avoid dragging each other down.
-   **Observability**: At least monitor queue depth, discard count (split by reason/data type), blocking wait time, retry count/backoff duration, send latency quantiles; if WAL/Replay enabled, also monitor WAL usage, replay backlog, replay rate, and replay discard reason.
-   **Reserve Disk and IOPS** (Roadmap): When planning to enable disk resume, reserve space and IOPS in advance, and assess impact of "Replay Speed Limit" on northward bandwidth/CPU; recommend placing WAL directory on independent data disk or reserving quota for it.

::: tip Configuration Suggestion
For critical facilities, recommend splitting critical data and telemetry data into different Apps, and prioritize guaranteeing queue capacity and retry window for critical Apps; for high-frequency telemetry, please use predictable backpressure/discard strategies to protect gateway stability.
:::

### 3.2 Strategy Matrix and Recommended Default

#### Strategy Matrix

| Data Type | Normal (Online) | Congested | Offline | Replay |
| :--- | :--- | :--- | :--- | :--- |
| **Control Plane / Alarm / Event** | Send As Is | **No Degrade** (Block if necessary) | Hybrid/DiskWal (Try to be complete) | Replay independent budget, prioritize not affecting real-time |
| **Attributes (Status/Attribute)** | Send As Is | **CoalesceLast** | CoalesceLast then WAL (Keep final state only) | Low speed retransmit (Usually small volume) |
| **Telemetry (High Frequency Time Series)** | Optional Light Sampling | **CoalesceLast + Sampling + TTL** (Keep New Discard Old) | More Aggressive Sampling + TTL; Compress then WAL | Strict Rate Limit + TTL; Never squeeze out real-time |

> Explanation: Offline and Queue Full do not conflict. During offline, merge/sample/TTL must also be done, otherwise WAL will explode, replay will drag down system; during congestion, (Hybrid) can also overflow "Compressed Data" to WAL to buffer spikes.

#### Replay Isolation

Recommend adopting "Two Logical Lanes + Budget Isolation" design (Roadmap):

-   **Realtime lane**: Real-time data always prioritized, guaranteeing low latency.
-   **Replay lane**: Historical replay independent rate limit/concurrency, and control upper limit via "Send Budget Ratio/Token Bucket" (e.g., Replay occupies at most 20% send budget).

## 4. Data Format

Currently northward plugins mainly use **JSON** payload, and provide multiple "Predictable JSON Shapes" to balance readability and throughput:

-   **EnvelopeJson (Default Recommended)**: Stable protocol envelope (`schema_version` + `event.kind` + `payload.data`), suitable for integration and long-term evolution.
-   **Kv / TimeseriesRows**: More biased towards throughput/TSDB flattened shape (Optionally include meta).
-   **MappedJson**: Declarative mapping (Map internal data to field structure expected by your platform).

> Detailed protocol see: [`EnvelopeJson (Stable Envelope)`](/northward/payload/envelope-json).

**Binary payloads like Protobuf/Avro belong to Roadmap**: In large-scale points/high-frequency reporting/expensive public network bandwidth scenarios, they can significantly reduce bandwidth and CPU overhead, but require stricter Schema management and version compatibility strategies.

| Feature | JSON | Protobuf / Avro |
| :--- | :--- | :--- |
| **Readability** | High (Text) | Low (Binary) |
| **Bandwidth Consumption** | High (Field name repetition) | **Very Low** (Save 60%+) |
| **CPU Overhead** | Medium (Slow parsing) | Low |
| **Schema Management** | Not Required (Self-describing) | **Required** (Need version management) |
| **Recommended Scenario** | Debugging, Quick Integration, Web Frontend Direct Consumption | **Large Scale Points**, **High Frequency Reporting**, Expensive Public Network Bandwidth |

### Product-Level Best Practice Plan (Protobuf/Avro, Roadmap)

-   **Unified Envelope**: Design stable envelope fields for binary payload (e.g., `schemaVersion`/`schemaId`/`contentType`/`encoding`), avoid "Distinguishing version only by topic" leading to O&M complexity explosion.
-   **Version Compatibility Strategy**: Enforce "Backward compatible" evolution constraints, avoid field deletion/semantic changes breaking cloud-side parsing.
-   **Gray Release and Rollback**: Recommend supporting "Dual Write (JSON + Binary) / Bypass Validation" for a period, switch after ensuring cloud-side parsing stability.
-   **Schema Management**: If accessing Schema Registry (Avro/Protobuf) or self-developed version repository, please include release process in CI, avoid drift caused by manual release.

::: warning
Current gateway does not yet provide production-ready Protobuf/Avro northward plugin implementation. After future iteration support, please ensure gateway side `.proto`/Schema version stays consistent with cloud-side parsing service, and establish "Backward Compatibility/Gray Release/Dual Write Validation" upgrade process, otherwise data decoding failure may occur.
:::
