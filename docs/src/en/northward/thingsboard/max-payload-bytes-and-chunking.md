---
title: 'Payload Limit (max_payload_bytes) & Chunking Algorithm'
description: 'How to set communication.max_payload_bytes; and ng-gateway "Fragment/Chunking" algorithm, boundary conditions, best practices and troubleshooting for ThingsBoard Gateway API uplink.'
---

## 1. Background

In ThingsBoard (TB) integration, MQTT broker / TB deployment often sets hard limits on single message size (e.g., 10KB, 64KB, 128KB etc., depending on your cluster and gateway configuration). If the gateway sends Publish exceeding the limit, common consequences are:

-   Broker directly rejects/disconnects (Gateway northward reconnects frequently)
-   Client library (This project uses `rumqttc`) errors during sending phase, causing session to enter error state
-   Message discarded or cannot be parsed normally by TB (Depends on broker/proxy layer)

Therefore, **Hard limit must be done in advance on gateway side**, splitting a batch of points into multiple **Legal and Acceptable Messages for TB**, ensuring session stability and throughput.

---

## 2. Configuration Definition and Default Value

ThingsBoard plugin configuration is located at `communication.max_payload_bytes`:

-   **Semantics**: Single MQTT Publish **payload byte limit** (Effective for actual bytes after JSON serialization)
-   **Default Value**: `9216` (9 KiB, reserving headroom for common 10 KiB broker limit)
-   **Lower Limit Protection**: Too small will be raised to minimum value (Implementation guarantees not less than 256), avoiding extreme configuration causing infinite loop/unavailability

Example:

```json
{
  "communication": {
    "message_format": "json",
    "qos": 1,
    "retain_messages": false,
    "max_payload_bytes": 9216,
    "keep_alive": 60,
    "clean_session": false
  }
}
```

:::: tip Recommended Configuration
-   If you are unsure about broker limit, **prioritize keeping default 9216**.
-   If your broker explicitly allows larger messages, can increase to 32KiB/64KiB; but please also assess TB side parsing pressure and network jitter risk.
::::

---

## 3. Accurate Meaning of "Chunking"

"Chunking/Chunking Algorithm" here refers to **Application Layer Chunking**:

-   Plugin splits a collection of points reported at once into multiple **Independent, Complete, TB Gateway API compliant JSON messages**
-   Each message can be handled independently by TB
-   **Does not** produce fragments "Requiring server-side reassembly", nor rely on TB doing re-assemble

:::: warning Do Not Confuse
This is not MQTT protocol layer fragmentation (MQTT does not provide cross-message automatic reassembly semantics). The strategy here is more like "batch → multiple publishes".
::::

---

## 4. Chunking Algorithm

Current implementation uses "Accumulate by item → Flush on limit" chunking strategy for both **Telemetry** and **Attributes**.

### 4.1 Telemetry Chunking (`v1/gateway/telemetry`)

Target payload shape (Each chunk strictly follows):

```json
{
  "Device-A": [
    {
      "ts": 1734870900000,
      "values": {
        "k1": 1,
        "k2": true
      }
    }
  ]
}
```

Algorithm Key Points:

-   **Accumulation Unit**: Each `point_key -> value` in `values`
-   **Size Calculation**: Based on real bytes after JSON serialization (Including string escape, number text length, etc.)
-   **Flush Strategy**: If appending next item causes \(`payload_bytes + next_entry_bytes + suffix_bytes > max_payload_bytes`\), then:
    -   First complete JSON suffix for current chunk and output (publish)
    -   Then restart building new chunk from same prefix

Boundary Behavior:

-   If **Single Item** (One `key:value`) itself cannot fit into any chunk (i.e., its bytes exceed limit), that item will be skipped (best-effort) to protect session stability.

### 4.2 Attributes Chunking (`v1/gateway/attributes`)

Target payload shape (Each chunk strictly follows):

```json
{
  "Device-A": {
    "serial": "A10086",
    "fw": "1.0.0"
  }
}
```

Algorithm same as Telemetry, just prefix/suffix different.

Boundary Behavior:

-   If single attribute item too large (Cannot fit in one chunk), will be directly discarded, and generate warn log (For troubleshooting).

---

## 5. How to Choose `max_payload_bytes` (Best Practice)

### 5.1 Rule of Thumb

-   **Default First**: Start from `9216` (9 KiB)
-   **Reserve Headroom**: Even if broker nominal 10 KiB, suggest leaving at least 5%~15% margin
-   **Large Field Caution**: Long strings, JSON arrays, floats with many decimals significantly amplify bytes
-   **Short Point Naming**: `point_key` is JSON key, repeats frequently; short key is critical for throughput

### 5.2 When to Increase

-   Broker/TB explicitly allows larger messages
-   You want to reduce publish count (Larger chunk → Fewer publish)
-   Network stable, TB parsing resources sufficient (CPU/Memory headroom)

### 5.3 When NOT to Increase

-   Edge network jitter obvious: Larger message easier to packet loss/Higher retransmission cost
-   TB cluster parsing pressure high: Single large JSON parsing time more significant
-   You already observed "Single message latency greater than expected"

---

## 6. Observability and Troubleshooting

### 6.1 Common Symptoms and Causes

-   **Gateway Northward Frequent Reconnect**: Common cause is broker rejecting over-limit publish; Check if `max_payload_bytes` too large, or existence of super large single point value.
-   **Small Amount of Points Missing on TB**: May be single item too large causing discard; Prioritize checking for abnormal long string/array.

### 6.2 Suggested Troubleshooting Actions

-   Lower `communication.max_payload_bytes` to conservative value (e.g., 9216) first, observe if connection stability improves
-   Check point data types and abnormal values (Especially long strings, arrays)
-   Shorten `point_key` (High frequency points suggest using short key, and mapping display on platform side)

---

## 7. FAQ

### 7.1 Will TB automatically merge multiple chunks?

No. TB treats each chunk as independent telemetry/attributes message. Plugin strategy ensures each message is **Self-consistent and Independently Consumable**.

### 7.2 Does this affect time series semantics?

Telemetry chunking splits same batch of points into multiple messages, but they share the same `ts` (Same batch same timestamp), platform side time series remains consistent.
