---
title: 'RPC & Attributes Downlink'
description: 'Downlink topics subscribed by ThingsBoard plugin, closed loop link, payload shape, and how to turn platform RPC/Attributes into gateway side events and write back.'
---

## 1. Downlink Topic Overview

Current implementation subscribes to:

### 1.1 Device API (Sent to gateway device itself)

-   **Attributes Change Notification (gateway device shared attributes changed, log only)**: `v1/devices/me/attributes`
-   **Attributes response (Currently unused)**: `v1/devices/me/attributes/response/+`
-   **Gateway-level RPC request**: `v1/devices/me/rpc/request/+`
-   **Gateway-level RPC response (Currently unused)**: `v1/devices/me/rpc/response/+`

### 1.2 Gateway API (Sent to gateway as TB Gateway)

-   **Sub-device RPC request**: `v1/gateway/rpc`
-   **Sub-device shared attributes changed (Mapped to WritePoint)**: `v1/gateway/attributes`

:::: warning Important Note
You might have seen `v1/gateway/attributes/request` / `v1/gateway/attributes/response` etc. topics in TB docs, but current plugin version **DOES NOT Subscribe** to them, nor follow attributes request/response semantics. For ng-gateway, attributes downlink recommends using "desired/reported" closed loop (See Section 4).
::::

---

## 2. Processing Flow

Sequence from TB to gateway internal event, then write back:

1.  Supervisor establishes MQTT connection
2.  Subscribe to above topics after receiving ConnAck, Ready upon success
3.  Event loop receives Publish → Router distributes to handler by topic
4.  Handler parses payload → Generates `NorthwardEvent`
5.  Core processes event uniformly, produces response if necessary:
    -   RPC produces `NorthwardData::RpcResponse` → ThingsBoard plugin publishes MQTT response
    -   Write Point produces `NorthwardData::WritePointResponse` → **Currently log only, not written back to TB**

---

## 3. RPC Downlink: Request/Map/Response (Closed Loop)

### 3.1 Sub-device RPC (TB → Gateway → Field Device)

#### Subscribe Topic

-   `v1/gateway/rpc`

#### Request Payload (Implementation Aligned)

```json
{
  "device": "Device-A",
  "data": {
    "id": 1,
    "method": "setValve",
    "params": { "open": true }
  }
}
```

#### Gateway Internal Event Mapping

-   Generate `NorthwardEvent::CommandReceived`
-   Mapping Key Points:
    -   `command_id = data.id.to_string()`
    -   `key = data.method`
    -   `params = data.params`
    -   `target_type = SubDevice`
    -   `device_name = device`

#### Response Write Back (Implementation Aligned)

When core finishes processing and produces `NorthwardData::RpcResponse`, plugin publishes back to **Same Topic**:

-   `v1/gateway/rpc`

Success (Recommend carrying `result`):

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

Failure:

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

:::: warning About request id type
TB `id` is integer. ng-gateway internally uses String request_id for generality, but must be **Number** when writing back to TB. Therefore:

-   **Recommended**: Platform side always use numeric id (e.g., `1` above), gateway side treats it as string pass-through and parses as number on write back.
-   **Not Recommended**: Custom non-numeric request_id (Will be discarded on write back).
::::

### 3.2 Gateway-level RPC (TB → Gateway Itself)

#### Subscribe Topic

-   `v1/devices/me/rpc/request/+`

Example: `v1/devices/me/rpc/request/42`

#### Request Payload (Implementation Aligned)

```json
{
  "method": "reboot",
  "params": { "delay_sec": 3 }
}
```

#### Gateway Internal Event Mapping

-   Generate `NorthwardEvent::CommandReceived`
-   `command_id` from last segment of topic (e.g., `42`)
-   `target_type = Gateway`
-   `device_name` fixed as `"gateway"` (For internal observability)

#### Response Write Back (Implementation Aligned)

Plugin publishes to:

-   `v1/devices/me/rpc/response/<request_id>`

Success: payload takes `RpcResponse.result` (If empty, write `{ "success": true }`).

Failure:

```json
{
  "success": false,
  "error": "reason"
}
```

---

## 4. Attributes Downlink: Best Practice Closed Loop (desired/reported)

### 4.1 Subscribe Topic

-   **Sub-device Shared Attributes Change (For Control Plane Write Point)**: `v1/gateway/attributes`
-   **Gateway Itself Device Attributes Change (Currently Log Only, Not Participating in Control Plane)**: `v1/devices/me/attributes`

### 4.2 Request Payload (Implementation Aligned)

For **Sub-device Shared Attributes Change**, ThingsBoard pushes:

```json
{
  "device": "Device-A",
  "data": {
    "setpoint": 12.34,
    "enable": true
  }
}
```

Then perform best-effort mapping:

-   Look up matching point in gateway runtime metadata: `device_name == device && point_key == key`
-   Convert to `WritePoint` and send to core for execution if found

For **Gateway Itself Device Attributes Change** (`v1/devices/me/attributes`), TB usually pushes a normal JSON map, e.g.:

```json
{
  "attribute1": "value1",
  "attribute2": 42
}
```

Current implementation logs it, but does not map to write point (Avoid coupling gateway configuration plane with control plane).

### 4.3 Why Attributes don't use response topic

TB attributes request/response semantics leans more towards "Read Attribute"; while production control is more commonly "Set Desired State". For gateway, the most robust closed loop is:

-   **desired**: Platform writes shared attributes (e.g., `desired.enable=true`)
-   Gateway receives change → Write Point
-   **reported**: Gateway reports actual field status via uplink telemetry/attributes (e.g., `reported.enable=true` or directly use point telemetry)

This closed loop is completed at data model layer, naturally supporting disconnection reconnection and eventual consistency.

---

## 5. Implementation Status and Current Limitations (Focus of "Perfecting Closed Loop" you mentioned)

### 5.1 Implemented

-   RPC request → `CommandReceived` → core → `RpcResponse` → MQTT Response (Both Sub-device RPC and Gateway-level RPC supported)
-   Attributes changed → best-effort map `WritePoint` (Match point metadata by `device_name + point_key`)

### 5.2 Currently Not Implemented/Enabled (Points needing modification when completing)

-   `v1/devices/me/attributes/response/+`: handler currently empty implementation (Ignored if received)
-   `v1/devices/me/rpc/response/+`: handler currently empty implementation (Ignored if received)
-   Write Point Result Write Back to TB: `WritePointResponse` currently log only, not sent back to TB (Recommend using RPC or reported status closed loop)

### 5.3 Write Point Closed Loop (Productization Landing Suggestion)

If your business explicitly requires "Get Success/Failure after Platform Initiates Write Point", suggest **NOT** relying on TB attributes-response, but adopting one of the following two:

#### Option A: Use RPC to Carry Write Point and Response (Strong Closed Loop)

-   Platform initiates server-side RPC
-   Gateway maps RPC to internal Write Point (Done by your command processing layer)
-   Gateway returns write point result via `RpcResponse` (Section 3 of this article)

Example (Suggested convention, for reference):

```json
{
  "device": "Device-A",
  "data": {
    "id": 1,
    "method": "write_point",
    "params": {
      "point_key": "setpoint",
      "value": 12.34
    }
  }
}
```

#### Option B: Attributes desired/reported (Eventual Consistency)

-   Platform writes shared attributes: `desired.*`
-   After gateway executes write point, report actual status via uplink telemetry/attributes: `reported.*`
-   Platform side uses rule engine or dashboard to use reported as "Completed State"
