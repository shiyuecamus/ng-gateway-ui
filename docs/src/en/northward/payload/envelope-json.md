---
title: 'EnvelopeJson (Stable Envelope)'
description: 'Northward default payload: schema_version + event.kind + envelope(meta) + payload.data. Suitable for long-term evolution and mixed events.'
---

## 1. Design Goals

EnvelopeJson pursues three things:

-   **Stable**: wire format has `schema_version`, facilitating long-term evolution
-   **Routable**: `event.kind` is a stable discriminator field (Required for mixed topic scenarios)
-   **Payload untagged**: Business data is placed in `payload.data`, no longer nested enum tag, reducing coupling

---

## 2. JSON Shape (schema_version = 1)

```json
{
  "schema_version": 1,
  "event": { "kind": "telemetry" },
  "envelope": {
    "ts_ms": 1734870900000,
    "app": { "id": 1, "name": "my-app", "plugin_type": "kafka" },
    "device": { "id": 1001, "name": "dev-1", "type": "pump-v1" }
  },
  "payload": {
    "data": {}
  }
}
```

::: tip Important Constraint
`payload.data` internally **will not have enum tag again** (e.g., shape like `{"Telemetry": {...}}` will not appear).
**The only discriminator field is `event.kind`**.
:::

---

## 3. `event.kind` Enum Values (snake_case)

### 3.1 uplink (Gateway → Platform)

-   `device_connected`
-   `device_disconnected`
-   `telemetry`
-   `attributes`
-   `alarm`
-   `rpc_response`
-   `write_point_response`

### 3.2 downlink (Platform → Gateway)

-   `write_point`
-   `command_received`
-   `rpc_response_received`

::: warning
Different plugins may only implement some of these event types. You should refer to specific plugin documentation.
:::

---

## 4. `envelope` Meta Information

`envelope` field is optional (downlink minimal input can be without it), uplink usually carries:

-   `ts_ms`: Millisecond timestamp (Telemetry/Attributes use collection time; Online/Offline events may use "Current Time")
-   `app`: app id/name/plugin_type
-   `device`: device id/name/type (`type` of Telemetry/Attributes may be empty)

---

## 5. What is inside `payload.data`

Specific fields of `payload.data` depend on event type (Corresponding to specific structure of `NorthwardData` or `NorthwardEvent`).

::: tip Best Practice
In initial integration, fix using EnvelopeJson first, make the link run through and stable observable; confirm correct before considering Kv/TimeseriesRows/MappedJson.
:::
