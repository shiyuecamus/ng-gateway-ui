---
title: 'Pulsar（北向插件）'
description: '把 NG Gateway 数据上送到 Apache Pulsar，并可选从 Pulsar topic 接收下行控制消息（WritePoint/Command/RPC）。'
---

## 1. 适用场景

- 使用 Pulsar 作为消息总线/数据管道（多租户、Namespace、持久化 topic）
- 把遥测/属性/上下线事件写入 Pulsar，供流计算/湖仓/告警系统消费
- （可选）通过 Pulsar 下发控制消息，实现 WritePoint/Command/RPC 回执

---

## 2. 最小可跑配置

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
