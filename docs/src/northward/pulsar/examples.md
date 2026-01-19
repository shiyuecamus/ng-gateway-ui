---
title: 'Pulsar 配置示例'
description: '可复制的 Pulsar App 配置示例：Telemetry 上送、启用 batching、启用下行写点。'
---

## 1. Telemetry 上送（默认压缩 LZ4）

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

## 2. 高吞吐：开启 batching

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

## 3. 启用下行写点（单 topic）

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

