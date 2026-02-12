---
title: 'Observability (Metrics / Logs / Realtime)'
description: 'NG Gateway Observability Guide: Prometheus Metrics (/metrics), UI Aggregated Metrics WS (/api/ws/metrics), Device Realtime Snapshot WS (/api/ws/monitor), Unified Logging System and Troubleshooting SOP.'
---

# Observability

This article is for O&M and secondary developers, aiming to let you quickly answer these questions **without guessing**:

-   Is the gateway alive? Are there obvious resource bottlenecks (CPU/Memory/Disk/Network)?
-   Is southward channel stable? Throughput, latency, reconnection, timeout, backpressure abnormal?
-   Is northward App stable? Send success rate, drops, errors and retries abnormal?
-   "Collection normal but upload abnormal" or "Collection itself abnormal"?
-   How to build **Standardized Troubleshooting SOP** using Unified Logs + Metrics + Realtime Snapshot?

NG Gateway observability consists of 4 links (From light to heavy):

-   **Health (Liveness Probe)**: `GET /health`
-   **Prometheus Metrics (Long cycle, Alertable)**: `GET /metrics`
-   **UI Aggregated Metrics Stream (Low cardinality realtime overview)**: `GET /api/ws/metrics`
-   **Device Realtime Data Snapshot (Troubleshooting only, High cardinality not into Prom)**: `GET /api/ws/monitor`

> Important Principle: **Prometheus always keeps low cardinality** (Forbid device/point entering labels), otherwise TSDB explosion; Device/Point level observation unified via WS Monitor or dedicated diagnostic API.

---

## 1. Quick Start: Where Should You Look?

-   **Gateway Overview (Dashboard)**: Resource, Connection Rate, Average Collection Time, Network Throughput
    -   UI: Dashboard / Gateway Overview (Corresponding WS `scope=global`)
-   **Southward Channel Observability**: TX/RX, Latency, Success Rate, Collection Timeout, Report Drops
    -   UI: Southward / Channel / Observability (Corresponding WS `scope=channel + device`)
-   **Northward App Observability**: Send, Drops, Errors, Retries, Average Latency
    -   UI: Northward / App / Observability (Corresponding WS `scope=app`)
-   **Device Realtime Monitor**: Latest snapshot and changes of device telemetry/attributes
    -   UI: Ops / Data Monitor (Corresponding WS `GET /api/ws/monitor`)

When you face a failure, suggest a fixed order (SOP):

1.  **Check Dashboard First**: Resource abnormal? Overall error rate elevated?
2.  **Then Check Specific Channel/App Observability**: Narrow problem scope to 1 channel/app
3.  **Enable Temporary Log Level (TTL override) if necessary and Reproduce**: See [`Configuration Management`](./configuration.md)
4.  **Finally Use Realtime Monitor to Verify Device Data Link**: Southward collected? Value changed?

---

## 2. Endpoint Overview

| Capability | Endpoint | Usage | Typical Consumer |
|---|---|---|---|
| Health | `GET /health` | Liveness Probe (LB/K8s readiness/liveness) | K8s Probe / Load Balancer |
| Prometheus metrics | `GET /metrics` | Standard Prometheus exposition (Pull) | Prometheus / VictoriaMetrics |
| UI Aggregated Metrics (WS) | `GET /api/ws/metrics` | UI Realtime Metrics (Low cardinality snapshot) | Web UI |
| Device Snapshot (WS) | `GET /api/ws/monitor` | Device telemetry/attributes realtime view (Troubleshooting) | Web UI / Tool Script |

::: warning Security Suggestion
-   **`/metrics` suggest only open to in-cluster Prometheus** (NetworkPolicy / SecurityGroup / Ingress ACL), avoid external probing/DDoS.
-   **`/api/ws/*` belongs to management plane**, usually requires login/auth; do not expose to public network.
:::

---

## 3. Prometheus Metrics

### 3.1 Key Design

-   Metric Namespace: Unified `ng_gateway_*` (Internal Registry namespace = `ng_gateway`)
-   **Low Cardinality**: Labels upper limit provable (Allow `channel_id/app_id/plugin_id/driver` etc. limited dimensions; forbid device/point)
-   **scrape-time refresh**: System resource and queue depth refresh at scrape time, ensuring Pull sees "Fresh Value"

::: tip
This ensures: Prometheus metrics can be used for `Alerting`, and won't `Blow up` TSDB in large scale device/point scenarios.
:::

### 3.2 Metric Dictionary

Below are "Most common, best for positioning" metric families in current implementation (Not exhausting all buckets and derived series).

#### (A) System Resource (scrape-time)

-   `ng_gateway_system_cpu_usage_ratio`: System CPU Usage (0~1)
-   `ng_gateway_system_memory_usage_ratio`: System Memory Usage (0~1)
-   `ng_gateway_system_disk_usage_ratio`: Root Partition Disk Usage (0~1)
-   `ng_gateway_process_cpu_usage_ratio`: Gateway Process CPU Usage (0~1, best-effort)
-   `ng_gateway_process_memory_rss_bytes`: Gateway Process RSS (bytes, best-effort)
-   `ng_gateway_network_bytes_sent_total` / `ng_gateway_network_bytes_received_total`: Process cumulative network bytes (best-effort)

#### (B) Queue and Backpressure (Global General)

All "Bounded Queues" register same set of metrics, labels only `queue` and limited `reason`.

-   `ng_gateway_queue_depth{queue="collector_outbound"}`: Queue Depth (best-effort)
-   `ng_gateway_queue_capacity{queue="collector_outbound"}`: Queue Capacity
-   `ng_gateway_queue_dropped_total{queue="...",reason="full|timeout|closed|buffer_full|expired"}`: Drop Cumulative
-   `ng_gateway_queue_blocked_seconds_bucket|sum|count{queue="..."}`: Sender Block Time (Backpressure Intensity)

#### (C) Collector (Collection Engine)

-   `ng_gateway_collector_cycles_total{result="success|fail|timeout"}`: Collection Cycle Count (By result)
-   `ng_gateway_collector_cycle_seconds_bucket|sum|count{result="..."}`: Collection Cycle Duration Distribution
-   `ng_gateway_collector_active_tasks`: Current Active Collection Tasks
-   `ng_gateway_collector_concurrency_permits{state="current|available"}`: Concurrency Permits (Current/Remaining)
-   `ng_gateway_collector_retries_total{reason="timeout|error"}`: Collection Retry Cumulative

#### (D) Southward

Management Plane (No labels):

-   `ng_gateway_southward_channels_total`
-   `ng_gateway_southward_channels_connected`
-   `ng_gateway_southward_devices_total`
-   `ng_gateway_southward_data_points_total`

Aggregated by Channel (labels: `channel_id, driver`):

-   `ng_gateway_southward_channel_connected{channel_id,driver}`: 0/1
-   `ng_gateway_southward_channel_state{channel_id,driver}`: State Enum Value (For trend/alert)
-   `ng_gateway_southward_channel_reconnect_total{channel_id,driver}`
-   `ng_gateway_southward_channel_connect_failed_total{channel_id,driver}`
-   `ng_gateway_southward_channel_disconnect_total{channel_id,driver}`
-   `ng_gateway_southward_channel_bytes_total{channel_id,driver,direction="in|out"}`
-   `ng_gateway_southward_io_total{channel_id,driver,result="success|failed"}`: Southward I/O Result Cumulative
-   `ng_gateway_southward_io_latency_seconds_bucket|sum|count{channel_id,driver,result="success|failed"}`
-   `ng_gateway_southward_collect_cycle_seconds_bucket|sum|count{channel_id,driver,result="success|failed|timeout"}`
-   `ng_gateway_southward_point_read_total{channel_id,driver,result="success|failed|timeout"}`
-   `ng_gateway_southward_report_publish_total{channel_id,driver,result="success|failed|dropped"}`

#### (E) Control plane (Write Point / Execute Action)

labels: `channel_id, driver`

-   `ng_gateway_control_write_requests_total{channel_id,driver,result="success|fail|timeout"}`
-   `ng_gateway_control_write_queue_wait_seconds_bucket|sum|count{channel_id,driver}`
-   `ng_gateway_control_write_execute_seconds_bucket|sum|count{channel_id,driver,result="..."}`
-   `ng_gateway_control_execute_requests_total{channel_id,driver,result="success|fail|timeout"}`
-   `ng_gateway_control_execute_seconds_bucket|sum|count{channel_id,driver,result="..."}`

#### (F) Northward

Management Plane (No labels):

-   `ng_gateway_northward_apps_total`
-   `ng_gateway_northward_apps_active`
-   `ng_gateway_northward_events_received_total`
-   `ng_gateway_northward_data_routed_total`
-   `ng_gateway_northward_routing_errors_total`

Aggregated by App (labels: `app_id, plugin_id, direction, result`):

-   `ng_gateway_northward_app_connected{app_id,plugin_id}`: 0/1
-   `ng_gateway_northward_app_state{app_id,plugin_id}`: State Enum Value
-   `ng_gateway_northward_app_reconnect_total{app_id,plugin_id}`
-   `ng_gateway_northward_messages_total{app_id,plugin_id,direction="uplink|downlink",result="success|fail|dropped"}`
-   `ng_gateway_northward_message_latency_seconds_bucket|sum|count{app_id,plugin_id,direction,result}`

### 3.3 Recommended PromQL

Below are some "Typical, Explainable, Actionable" query ideas (Adjust time window and threshold as needed).

> Note: Queue depth/blocking duration highly depends on scenario (Point count, collection period, network RTT), threshold should be determined combining stress test and historical baseline.

-   **Collection Timeout Rate (Last 5 minutes)**

```promql
sum(rate(ng_gateway_collector_cycles_total{result="timeout"}[5m]))
/
sum(rate(ng_gateway_collector_cycles_total[5m]))
```

-   **Southward Channel Timeout (Aggregated by channel_id)**

```promql
sum by (channel_id) (rate(ng_gateway_southward_point_read_total{result="timeout"}[5m]))
```

-   **Northward Drops Rate (Aggregated by app_id)**

```promql
sum by (app_id) (
  rate(ng_gateway_northward_messages_total{direction="uplink",result="dropped"}[5m])
)
```

-   **Backpressure Intensity: Queue Block Time P95 (Last 5 minutes)**

```promql
histogram_quantile(
  0.95,
  sum by (le, queue) (rate(ng_gateway_queue_blocked_seconds_bucket[5m]))
)
```

---

## 4. UI Aggregated Metrics
::: warning
Realtime overview, not replacement for Prometheus
:::

`/api/ws/metrics` design goal is: Provide **Low Cardinality, Explainable, Controllable Cost** realtime visualization in UI, not moving all Prometheus metrics "Into Browser".

### 4.1 Scope and Subscription Semantics

One WebSocket connection can subscribe to multiple scopes simultaneously (UI does this):

-   `global`: Gateway Overview Snapshot (Dashboard)
-   `channel`: Aggregated snapshot of a southward channel
-   `device`: Observation row list **by device** under a channel (Note: This is "List Snapshot", may be large)
-   `app`: Aggregated snapshot of a northward App

Client Message:

```json
{ "type": "subscribe", "scope": "global", "intervalMs": 1000, "requestId": "..." }
{ "type": "subscribe", "scope": "channel", "id": 1, "intervalMs": 1000, "requestId": "..." }
{ "type": "unsubscribe", "scope": "channel", "id": 1, "requestId": "..." }
{ "type": "ping", "ts": 1730000000000 }
```

Server Behavior Key Points:

-   **Server-side Coalescing**: Output by interval tick, won't push infinitely due to frequent internal changes
-   **Interval Clamp**: Server limits `intervalMs` to \([200, 5000]\)ms
-   **Device Scope**: To simplify frontend logic, server sends "Full Rows" (Instead of incremental patch)

### 4.2 Where do values on page come from?

-   Dashboard `CPU/Memory/Disk/Network Throughput` from `GatewayStatusSnapshot.systemInfo + metrics.*` (Generated by MetricsHub)
-   Channel Observability:
    -   `TX/RX Bps`: Difference calculated in frontend from `bytesSent/bytesReceived` cumulative values
    -   `avg latency`: From `averageResponseTime` (Backend built with EWMA/last)
    -   `pointRead*`, `reportPublish*`: From channel aggregated counters
    -   per-device row: From `DeviceStatsSnapshot` (WS `scope=device` rows)
-   App Observability:
    -   `messagesSent/Dropped/Errors/Retries`: From app aggregated counters
    -   `avgLatencyMs`: From app send duration EWMA (snapshot state)

---

## 5. Device Realtime Snapshot

`/api/ws/monitor` goal is to let you quickly answer during field troubleshooting: "Did gateway collect latest value?"
It subscribes by device, and pushes two types of data:

-   `telemetry`
-   `attributes` (client/shared/server)

### 5.1 Merge/Rate Limit (Why you won't be flooded by points)

Server will **Merge then Push** updates of same device within short window (Current window 200ms), avoiding "One frame per point" causing UI freeze.
Frontend also throttles UI trigger by 200ms, ensuring table refresh cost controllable.

> This also means: Realtime Monitor is "Near Realtime", not Oscilloscope; it is for troubleshooting and verification, not millisecond-level reconciliation.

---

## 6. Unified Logs: How to link with Metrics/Realtime

Log governance (Global level + per-channel/per-app TTL override + Rotation/Download/Cleanup) is key to troubleshooting closed loop, see:

-   [`Configuration Management`](./configuration.md)

This page only emphasizes two points strongly related to observability:

-   **Do not keep DEBUG/TRACE on globally for long**: Prioritize using **TTL override** for targeted amplification
-   **Locate channel/app first then enable log**: Observability link goal is to narrow scope to 1 object

---

## 7. Recommended Troubleshooting SOP

### 7.1 "Device No Data / High Data Latency"

-   **Check Dashboard First**: CPU/Memory/Disk abnormal? Collector average time elevated?
-   **Check Queue Backpressure**: `queue_depth` continuously rising? `queue_blocked_seconds` increasing? `queue_dropped_total` growing?
-   **Enter Target Channel Observability**:
    -   Collection Mode: Check `collectPointTimeout`, `avg latency`, `reconnects`
    -   Report Mode: Check `publishDropped`/`publishFail`, `lastReportAge`
-   **Enter Realtime Monitor**: Subscribe that device, check if telemetry/attributes changing
-   **If Necessary: Enable DEBUG for that channel (TTL=5min) and Reproduce**: Download log package for archiving

### 7.2 "Collection Normal but Northward Upload Abnormal"

-   **Use Realtime Monitor First** verify device telemetry changing (Exclude southward issue)
-   **Then Check App Observability**:
    -   drops/s, errors/s, avgLatencyMs abnormal?
    -   `retries` continuously growing? (Usually means peer unstable/auth issue)
-   **If Necessary Enable DEBUG for that App (TTL=5min)**, reproduce and download logs

---

## 8. Common Misconceptions

-   **Misconception 1: Stuff per-device/per-point metrics into Prometheus**
    This will crash TSDB directly at real scale. NG Gateway design is: Prom low cardinality, device level via monitor/ws or dedicated diagnosis.

-   **Misconception 2: Increase queue immediately seeing drops**
    Larger queue only "Exposes problem later", and occupies more memory. Correct posture is: Locate who is slow first (Southward I/O, Northward Peer, CPU Pressure), then tune.

-   **Misconception 3: Global DEBUG/TRACE as Norm**
    Will bring uncontrollable cost of Encoding/IO/Disk. Please use per-channel/per-app TTL override.
