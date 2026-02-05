---
title: 'TimeseriesRows（行式）'
description: '面向 TSDB/数据湖的上行 payload：按点位展开为 rows 数组；可选 includeMeta 输出 data_type。'
---

## 1. JSON 形状

### 1.1 `includeMeta = false`

```json
[
  {
    "ts_ms": 1734870900000,
    "point_id": 10001,
    "point_key": "temp",
    "value": 25.6,
    "data_type": null
  },
  {
    "ts_ms": 1734870900000,
    "point_id": 10002,
    "point_key": "running",
    "value": true,
    "data_type": null
  }
]
```

### 1.2 `includeMeta = true`

```json
[
  {
    "ts_ms": 1734870900000,
    "point_id": 10001,
    "point_key": "temp",
    "value": 25.6,
    "data_type": "float64"
  }
]
```

---

## 2. 适用范围

TimeseriesRows 主要用于：

- Telemetry
- Attributes（会合并三类 attribute）

对于其他事件类型，输出可能为空数组或被忽略。建议混合事件场景仍使用 `EnvelopeJson`。

---

## 3. 最佳实践

### 3.1 分区建议

把时间分区放在 topic 层，payload 保持稳定：

```text
lake.{{yyyy}}.{{MM}}.{{dd}}.{{HH}}.telemetry
```

### 3.2 行式的好处

- 更接近“事实表”的写入形态（每行一条 point value）
- 平台侧更容易按 `point_key` 做列映射或标签化

