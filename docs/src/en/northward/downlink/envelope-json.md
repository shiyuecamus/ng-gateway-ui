---
title: 'Downlink EnvelopeJson'
description: 'Recommended downlink protocol: boot_contract + event.kind + payload.data; supports mixed topic and the exact boot contract.'
---

## 1. Minimal JSON Shape (boot_contract = "boot")

Downlink EnvelopeJson allows omitting `envelope` meta information (Optional):

```json
{
  "boot_contract": "boot",
  "event": { "kind": "write_point" },
  "payload": {
    "data": {
      "requestId": "req-123",
      "idempotencyKey": "operator-intent-123",
      "pointId": 10001,
      "valueType": 0,
      "value": true,
      "timestamp": "2026-01-19T00:00:00Z",
      "timeoutMs": 5000
    }
  }
}
```

::: tip
`valueType: 0` declares a Boolean value. `requestId` correlates the reply; `idempotencyKey` identifies the physical control intent. Reusing the key returns the recorded operation and must not send a second control.

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
