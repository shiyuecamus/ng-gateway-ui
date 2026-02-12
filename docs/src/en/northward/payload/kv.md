---
title: 'Kv (ts_ms + values)'
description: 'More compact uplink payload: {ts_ms, values:{key:value}}; optional includeMeta outputs {value,data_type}.'
---

## 1. JSON Shape

### 1.1 `includeMeta = false` (Default)

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

When you want to get lightweight type information on consumption side (For table creation/validation):

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
`data_type` comes from point meta information (point meta). If a point meta is temporarily unavailable, the system will degrade to plain output without `data_type`.
:::

---

## 2. Applicable Scope

`Kv` is only applicable to:

-   Telemetry
-   Attributes (Will merge client/shared/server three types of attributes)

::: warning Do not use Kv for device online/offline events
Current version Kv encoding path does not guarantee safety for non-Telemetry/Attributes events.
Suggestion: Continue using `EnvelopeJson` for online/offline events.
:::
