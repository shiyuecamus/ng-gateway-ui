---
title: 'Kafka (Northward Plugin)'
description: 'Upload NG Gateway data to Kafka, and optionally receive downlink control messages (WritePoint/Command/RPC) from Kafka topic.'
---

## 1. Applicable Scenarios

-   Write telemetry/attributes/online/offline events to **Kafka**, for consumption by data lake, stream computing, alarm system
-   Issue control messages via Kafka topic, implementing **WritePoint / Command / RPC Receipt** (Optional)

---

## 2. What You Need to Prepare

-   Kafka broker address (`bootstrap.servers`)
-   (Optional) TLS certificate file path (Path inside container)
-   (Optional) SASL username password and mechanism
-   Planning:
    -   uplink topic naming rule
    -   Partition strategy (key)
    -   Whether downlink is needed (and control plane topic planning)

---

## 3. Quickest Run (Minimal Configuration)

### 3.1 Uplink Only (Recommend running through first)

```json
{
  "connection": {
    "bootstrapServers": "127.0.0.1:9092",
    "security": { "protocol": "plaintext" }
  },
  "uplink": {
    "enabled": true,
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

Verification:

-   Consume `ng.uplink.telemetry`, see if messages are produced (Suggest verifying with single device first)

### 3.2 Enable Downlink (Optional)

Downlink details: [`Kafka Downlink`](/northward/kafka/downlink)

---

## 4. Navigation (Recommend reading in order)

-   Connection & Security: [`Kafka Connection & Security`](/northward/kafka/connection-security)
-   Uplink: [`Kafka Uplink Configuration & Payload`](/northward/kafka/uplink)
-   Partition & Ordering: [`Kafka Partition, Idempotency & Throughput Tuning`](/northward/kafka/partitions)
-   Downlink: [`Kafka Downlink (commit/ack semantics)`](/northward/kafka/downlink)
-   Examples: [`Kafka Configuration Examples`](/northward/kafka/examples)
-   Troubleshooting: [`Kafka Troubleshooting`](/northward/kafka/troubleshooting)
