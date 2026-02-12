---
title: 'Pulsar (Northward Plugin)'
description: 'Upload NG Gateway data to Apache Pulsar, and optionally receive downlink control messages (WritePoint/Command/RPC) from Pulsar topic.'
---

## 1. Applicable Scenarios

-   Use Pulsar as message bus/data pipeline (Multi-tenant, Namespace, Persistent Topic)
-   Write telemetry/attributes/online/offline events to Pulsar, for consumption by stream computing/lakehouse/alarm system
-   (Optional) Issue control messages via Pulsar, implementing WritePoint/Command/RPC Receipt

---

## 2. Minimal Runnable Configuration

```json
{
  "connection": {
    "serviceUrl": "pulsar://127.0.0.1:6650",
    "auth": { "mode": "none" }
  },
  "uplink": {
    "enabled": true,
    "telemetry": {
      "enabled": true,
      "topic": "persistent://public/default/ng.uplink.telemetry",
      "key": "{{device_id}}",
      "payload": { "mode": "envelope_json" }
    }
  },
  "downlink": { "enabled": false }
}
```
