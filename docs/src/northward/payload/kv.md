---
title: 'Kv（ts_ms + values）'
description: '更紧凑的上行 payload：{ts_ms, values:{key:value}}；可选 includeMeta 输出 {value,data_type}。'
---

## 1. JSON 形状

### 1.1 `includeMeta = false`（默认）

```json
{
  "ts_ms": 1734870900000,
  "values": {
    "temp": 25.6,
    "running": true,
    "serial": "A10086"
  }
}
```

### 1.2 `includeMeta = true`

当你希望在消费侧拿到轻量类型信息（用于落表/校验）：

```json
{
  "ts_ms": 1734870900000,
  "values": {
    "temp": { "value": 25.6, "data_type": "float64" },
    "running": { "value": true, "data_type": "boolean" }
  }
}
```

::: tip
`data_type` 来自点位元信息（point meta）。如果某个点位元信息暂时不可用，系统会退化为不带 `data_type` 的 plain 输出。
:::

---

## 2. 适用范围

`Kv` 只适用于：

- Telemetry
- Attributes（会合并 client/shared/server 三类 attributes）

::: warning 不要把 Kv 用在设备上下线等事件
当前版本 Kv 编码路径对非 Telemetry/Attributes 事件不保证安全。  
建议：上下线事件继续使用 `EnvelopeJson`。
:::

