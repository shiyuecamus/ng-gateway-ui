---
title: '模板变量表（RenderContext）'
description: '北向 uplink topic/key 模板可用变量：app/device/event/time 分区字段，以及可用性差异说明。'
---

## 1. 变量总览

### 1.1 通用变量（所有 uplink 都可用）

| 变量 | 类型 | 说明 |
| --- | --- | --- |
| `app_id` | string | App ID（数字会转字符串） |
| `app_name` | string | App 名称 |
| `plugin_type` | string | 插件类型（例如 `kafka` / `pulsar`） |
| `event_kind` | string | 事件类型（如 `telemetry`/`attributes`/`device_connected`/`device_disconnected`） |
| `ts_ms` | string | 毫秒时间戳（字符串） |
| `device_id` | string | 设备 ID（字符串） |
| `device_name` | string | 设备名称 |

### 1.2 条件变量（某些事件类型可能为空）

| 变量 | 类型 | 说明 | 可能为空的原因 |
| --- | --- | --- | --- |
| `device_type` | string | 设备类型 | Telemetry/Attributes 目前可能没有 device_type |
| `channel_name` | string | 通道名称 | Telemetry/Attributes 通过 point meta 推断，缺 meta 或 values 为空时可能取不到 |

::: tip
对于可能为空的变量，建议用 `default helper` 兜底，避免 topic/key 里出现空段。
:::

### 1.3 时间分区变量（UTC）

这些变量用于构建按时间分区的 topic（例如写入数据湖）：

| 变量 | 示例 | 说明 |
| --- | --- | --- |
| `yyyy` | `2026` | 年（4 位） |
| `MM` | `01` | 月（2 位） |
| `dd` | `19` | 日（2 位） |
| `HH` | `08` | 小时（2 位，UTC） |

示例：

```text
lake.{{yyyy}}.{{MM}}.{{dd}}.{{HH}}.ng.uplink.{{event_kind}}
```

---

## 2. 关于“缺失变量”的行为

模板引擎是 **non-strict**：

- 变量缺失 → 渲染为空字符串
- 不会报错（也不会阻止发送）

因此：

- 想要稳定 topic：使用 `default` helper
- 想要快速发现问题：在排障时观察“topic 是否被渲染为空/异常”

