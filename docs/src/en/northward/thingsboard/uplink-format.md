---
title: 'Uplink Message Format (TB Gateway API)'
description: 'ThingsBoard plugin uplink uses TB Gateway API MQTT topic and JSON payload shape (telemetry/attributes/connect/disconnect).'
---

## 1. Uplink Topic

ThingsBoard plugin uses TB Gateway API topics:

-   Telemetry: `v1/gateway/telemetry`
-   Attributes: `v1/gateway/attributes`
-   Connect: `v1/gateway/connect`
-   Disconnect: `v1/gateway/disconnect`
-   RPC Response (SubDevice): `v1/gateway/rpc`
-   RPC Response (Gateway): `v1/devices/me/rpc/response/<request_id>`

---

## 2. Telemetry JSON Shape

Gateway telemetry is grouped by "Device Name":

```json
{
  "Device-A": [
    {
      "ts": 1734870900000,
      "values": {
        "temp": 25.6,
        "running": true
      }
    }
  ]
}
```

:::: tip
Key name uses point `point_key`. Recommend keeping `point_key` stable and platform-friendly during modeling phase.
::::

### 2.1 Field Semantics (Implementation Aligned)

-   **Device Name (root key)**: e.g., `Device-A`, represents TB sub-device name, from gateway internal `device_name`.
-   **`ts`**: Millisecond timestamp (epoch millis).
-   **`values`**: Point key-value collection; key from point `point_key`, value from `NGValue` JSON serialization semantics (e.g., int/bool/string etc.).

### 2.2 `max_payload_bytes` and Automatic Chunking

When a telemetry upload contains many points or large values (e.g., long string/array), single JSON payload may exceed broker/platform limit. The plugin performs **Automatic Chunking** on telemetry:

-   **Chunking Granularity**: Accumulate by key/value in `values` one by one.
-   **Flush Strategy**: Once appending next item causes bytes to exceed `communication.max_payload_bytes`, flush current chunk immediately and start a new chunk.
-   **Message Validity**: Each chunk is a **Complete and Legal** TB Gateway Telemetry JSON (Still the shape shown in this section).
-   **Result Form**: The same batch of data may publish multiple `v1/gateway/telemetry` messages.

:::: warning Important Clarification
"Chunking" here is **Application Layer Chunking**: Splitting a batch of points into multiple **Independent Legal Messages**. It is not MQTT protocol layer fragmentation, nor does it rely on ThingsBoard's "Reassembly" capability.
::::

See: [`max_payload_bytes and Chunking Algorithm`](/northward/thingsboard/max-payload-bytes-and-chunking).

---

## 3. Attributes JSON Shape

Attributes use client-side attributes publish shape:

```json
{
  "Device-A": {
    "serial": "A10086",
    "fw": "1.0.0"
  }
}
```

Current implementation only publishes `client_attributes`.

### 3.1 Attributes Chunking Rules

Attributes are also controlled by `communication.max_payload_bytes`, rules consistent with telemetry: Accumulate by key/value, split into multiple `v1/gateway/attributes` publishes if necessary.

Key Points:

-   **Does not change payload shape**: Each message is still `{ "<device>": { ... } }`
-   **Chunking Granularity**: By attributes key/value

See: [`max_payload_bytes and Chunking Algorithm`](/northward/thingsboard/max-payload-bytes-and-chunking).

---

## 4. Connect / Disconnect

Device Online/Offline events:

```json
{
  "device": "Device-A",
  "type": "pump-v1"
}
```

---

## 5. RPC Response Packet (RpcResponse)

`RpcResponse` is the return packet for **Downlink RPC Closed Loop**, but from MQTT direction it belongs to gateway outbound publish to TB. Here provides topic and payload shape needed to align on "Uplink Side" (Closed loop semantics see: [`RPC/Attributes Downlink`](/northward/thingsboard/rpc-and-attributes)).

### 5.1 Sub-device RPC Response (Gateway API)

-   topic: `v1/gateway/rpc`
-   payload (Success):

```json
{
  "device": "Device-A",
  "id": 1,
  "data": {
    "success": true,
    "result": { "applied": true }
  }
}
```

-   payload (Failure):

```json
{
  "device": "Device-A",
  "id": 1,
  "data": {
    "success": false,
    "error": "timeout"
  }
}
```

:::: warning
ThingsBoard `id` is integer. Current implementation tries to parse internal `request_id` as number; if not a number, the response will be discarded.
::::

### 5.2 Gateway-level RPC Response (Device API)

-   topic: `v1/devices/me/rpc/response/<request_id>`
-   payload: Recommend returning any serializable JSON; on failure recommend including `{ "success": false, "error": "..." }`

---

## 6. Protobuf (Currently Not Supported)

Although configuration item supports `message_format=protobuf`, current implementation will return error.

If you have stronger demand for payload size and throughput, prioritize suggesting:

-   Reasonably configure `communication.max_payload_bytes` and understand chunking strategy (Avoid broker disconnecting/erroring due to limit exceeded).
-   Control single upload point count (Or reduce large fields).
-   Constrain `point_key` length (JSON key name significantly affects byte count).
