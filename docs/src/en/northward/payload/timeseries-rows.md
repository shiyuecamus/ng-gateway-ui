---
title: 'TimeseriesRows (Row-based)'
description: 'Uplink payload for TSDB/Data Lake: Expand by point into rows array; optional includeMeta outputs data_type.'
---

## 1. JSON Shape

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

## 2. Applicable Scope

TimeseriesRows is mainly used for:

-   Telemetry
-   Attributes (Will merge three types of attributes)

For other event types, output may be empty array or ignored. Suggest still using `EnvelopeJson` for mixed event scenarios.

---

## 3. Best Practice

### 3.1 Partition Suggestion

Put time partition on topic layer, keep payload stable:

```text
lake.{{yyyy}}.{{MM}}.{{dd}}.{{HH}}.telemetry
```

### 3.2 Benefits of Row-based

-   Closer to "Fact Table" write form (One point value per row)
-   Easier for platform side to do column mapping or tagging by `point_key`
