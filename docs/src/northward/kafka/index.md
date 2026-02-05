---
title: 'Kafka（北向插件）'
description: '把 NG Gateway 数据上送到 Kafka，并可选从 Kafka topic 接收下行控制消息（WritePoint/Command/RPC）。'
---

## 1. 适用场景

- 把遥测/属性/上下线事件写入 **Kafka**，供数据湖、流计算、告警系统消费
- 通过 Kafka topic 下发控制消息，实现 **WritePoint / Command / RPC 回执**（可选）

---

## 2. 你需要准备什么

- Kafka broker 地址（`bootstrap.servers`）
- （可选）TLS 证书文件路径（容器内路径）
- （可选）SASL 用户名密码与机制
- 规划：
  - uplink topic 命名规则
  - 分区策略（key）
  - 是否需要 downlink（以及控制面 topic 规划）

---

## 3. 最快跑通（最小配置）

### 3.1 仅上行（推荐先跑通）

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

验证：

- 消费 `ng.uplink.telemetry`，看是否有消息产出（建议先用单一设备验证）

### 3.2 启用下行（可选）

下行详见：[`Kafka 下行（Downlink）`](/northward/kafka/downlink)

---

## 4. 目录导航（建议按顺序读）

- 连接与安全：[`Kafka 连接与安全`](/northward/kafka/connection-security)
- 上行（Uplink）：[`Kafka 上行配置与 payload`](/northward/kafka/uplink)
- 分区与有序性：[`Kafka 分区、幂等与吞吐调优`](/northward/kafka/partitions)
- 下行（Downlink）：[`Kafka 下行（commit/ack 语义）`](/northward/kafka/downlink)
- 示例：[`Kafka 配置示例`](/northward/kafka/examples)
- 排障：[`Kafka 排障`](/northward/kafka/troubleshooting)
