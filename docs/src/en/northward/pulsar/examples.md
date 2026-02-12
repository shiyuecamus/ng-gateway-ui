---
title: 'Pulsar Configuration Examples'
description: 'Copyable Pulsar App configuration examples: Telemetry upload, enable batching, enable downlink write point.'
---

## 1. Telemetry Upload (Default Compression LZ4)

```json
{
  "connection": {
    "serviceUrl": "pulsar://pulsar-broker:6650",
    "auth": { "mode": "none" }
  },
  "uplink": {
    "enabled": true,
    "producer": {
      "compression": "lz4",
      "batchingEnabled": false
    },
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

---

## 2. High Throughput: Enable Batching

```json
{
  "uplink": {
    "producer": {
      "compression": "lz4",
      "batchingEnabled": true,
      "batchingMaxMessages": 1000,
      "batchingMaxBytes": 131072,
      "batchingMaxPublishDelayMs": 10
    }
  }
}
```

---

## 3. Enable Downlink Write Point (Single Topic)

```json
{
  "downlink": {
    "enabled": true,
    "writePoint": {
      "enabled": true,
      "topic": "persistent://public/default/ng.downlink",
      "payload": { "mode": "envelope_json" },
      "ackPolicy": "on_success",
      "failurePolicy": "drop"
    }
  }
}
```
