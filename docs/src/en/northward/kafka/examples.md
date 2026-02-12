---
title: 'Kafka Configuration Examples'
description: 'Copyable Kafka App configuration examples for common scenarios: Telemetry upload, time partitioning, enabling downlink write point.'
---

## 1. Telemetry Upload (Partition by Device)

```json
{
  "connection": {
    "bootstrapServers": "kafka-1:9092,kafka-2:9092",
    "security": { "protocol": "plaintext" }
  },
  "uplink": {
    "enabled": true,
    "producer": {
      "enableIdempotence": true,
      "acks": "all",
      "compression": "lz4",
      "lingerMs": 5,
      "batchNumMessages": 1000,
      "batchSizeBytes": 131072,
      "messageTimeoutMs": 30000,
      "requestTimeoutMs": 10000,
      "maxInflight": 5
    },
    "telemetry": {
      "enabled": true,
      "topic": "ng.uplink.telemetry",
      "key": "{{device_id}}",
      "payload": { "mode": "envelope_json" }
    }
  },
  "downlink": { "enabled": false }
}
```

---

## 2. Write to Data Lake Partitioned by Time (Topic + UTC Partition)

```json
{
  "uplink": {
    "telemetry": {
      "enabled": true,
      "topic": "lake.{{yyyy}}.{{MM}}.{{dd}}.{{HH}}.telemetry",
      "key": "{{device_id}}",
      "payload": { "mode": "timeseries_rows", "includeMeta": true }
    }
  }
}
```

Variable table see: [`Template Variable Table`](/northward/templates/variables)

---

## 3. Enable Downlink Write Point (Single Topic)

```json
{
  "downlink": {
    "enabled": true,
    "writePoint": {
      "enabled": true,
      "topic": "ng.downlink",
      "payload": { "mode": "envelope_json" },
      "ackPolicy": "on_success",
      "failurePolicy": "drop"
    }
  }
}
```

Downlink protocol see: [`Downlink EnvelopeJson`](/northward/downlink/envelope-json)
