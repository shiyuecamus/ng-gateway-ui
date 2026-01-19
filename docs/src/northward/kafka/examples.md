---
title: 'Kafka 配置示例'
description: '给常见场景可复制的 Kafka App 配置示例：遥测上送、按时间分区、启用下行写点。'
---

## 1. 遥测上送（按设备分区）

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

## 2. 按时间分区写入数据湖（topic + UTC 分区）

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

变量表见：[`模板变量表`](/northward/templates/variables)

---

## 3. 启用下行写点（单 topic）

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

下行协议见：[`下行 EnvelopeJson`](/northward/downlink/envelope-json)

