---
title: 'Downlink EnvelopeJson'
description: 'Recommended downlink protocol: schema_version + event.kind + payload.data; supports mixed topic and stable evolution.'
---

## 1. Minimal JSON Shape (schema_version = 1)

Downlink EnvelopeJson allows omitting `envelope` meta information (Optional):

```json
{
  "schema_version": 1,
  "event": { "kind": "write_point" },
  "payload": {
    "data": {
      "request_id": "req-123",
      "point_id": 10001,
      "value": 1,
      "timestamp": "2026-01-19T00:00:00Z",
      "timeout_ms": 5000
    }
  }
}
```

::: tip
Parsing will first use `event.kind` for routing matching:
-   kind mismatch → Directly ignore (Not treated as error)
-   kind match but payload shape incorrect → Treated as "Decoding Error"
:::

---

## 2. Supported Downlink kind

-   `write_point`
-   `command_received`
-   `rpc_response_received`

Different plugins support different ranges, please refer to plugin specific documentation.

---

## 3. Production Suggestion

-   **One control plane topic carries only one kind**: Simplest, least noise
-   If mixing is necessary: EnvelopeJson is still usable because `event.kind` is routable

More strategies see: [`Downlink Overview`](/northward/downlink/overview)
