---
title: '下行 EnvelopeJson'
description: '推荐的下行协议：schema_version + event.kind + payload.data；支持混合 topic 与稳定演进。'
---

## 1. 最小 JSON 形状（schema_version = 1）

下行 EnvelopeJson 允许省略 `envelope` 元信息（可选）：

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
解析时会先用 `event.kind` 做路由匹配：
- kind 不匹配 → 直接忽略（不当作错误）
- kind 匹配但 payload shape 不对 → 才会视为“解码错误”
:::

---

## 2. 支持的下行 kind

- `write_point`
- `command_received`
- `rpc_response_received`

不同插件支持范围不同，请以插件分册为准。

---

## 3. 生产建议

- **一个控制面 topic 只承载一种 kind**：最简单，也最少噪声
- 如果必须混合：EnvelopeJson 仍然可用，因为 `event.kind` 可路由

更多策略见：[`下行总览`](/northward/downlink/overview)

