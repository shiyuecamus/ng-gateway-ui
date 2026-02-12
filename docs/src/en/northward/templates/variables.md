---
title: 'Template Variable Table (RenderContext)'
description: 'Northward uplink topic/key template available variables: app/device/event/time partition fields, and availability difference explanation.'
---

## 1. Variable Overview

### 1.1 General Variables (Available for all uplinks)

| Variable | Type | Description |
| :--- | :--- | :--- |
| `app_id` | string | App ID (Number converted to string) |
| `app_name` | string | App Name |
| `plugin_type` | string | Plugin Type (e.g., `kafka` / `pulsar`) |
| `event_kind` | string | Event Type (e.g., `telemetry`/`attributes`/`device_connected`/`device_disconnected`) |
| `ts_ms` | string | Millisecond Timestamp (String) |
| `device_id` | string | Device ID (String) |
| `device_name` | string | Device Name |

### 1.2 Conditional Variables (May be empty for some event types)

| Variable | Type | Description | Reason for Potential Emptiness |
| :--- | :--- | :--- | :--- |
| `device_type` | string | Device Type | Telemetry/Attributes currently may not have device_type |
| `channel_name` | string | Channel Name | Telemetry/Attributes inferred via point meta, may not be available if meta missing or values empty |

::: tip
For variables that may be empty, recommend using `default helper` as fallback, avoiding empty segments in topic/key.
:::

### 1.3 Time Partition Variables (UTC)

These variables are used to build time-partitioned topics (e.g., writing to data lake):

| Variable | Example | Description |
| :--- | :--- | :--- |
| `yyyy` | `2026` | Year (4 digits) |
| `MM` | `01` | Month (2 digits) |
| `dd` | `19` | Day (2 digits) |
| `HH` | `08` | Hour (2 digits, UTC) |

Example:

```text
lake.{{yyyy}}.{{MM}}.{{dd}}.{{HH}}.ng.uplink.{{event_kind}}
```

---

## 2. Behavior of "Missing Variables"

The template engine is **non-strict**:

-   Variable missing → Renders as empty string
-   No error (And does not block sending)

Therefore:

-   Want stable topic: Use `default` helper
-   Want to quickly find issues: Observe "Whether topic is rendered as empty/abnormal" during troubleshooting
