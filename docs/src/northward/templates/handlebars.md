---
title: '模板语法（Handlebars）'
description: '北向 uplink 的 topic/key 支持 Handlebars 模板语法；本文解释语法、默认行为与常见坑。'
---

## 1. 适用范围

当前模板渲染用于：

- **uplink topic**（例如 Kafka/Pulsar 的 `uplink.*.topic`）
- **uplink key/partition key**（例如 Kafka record key / Pulsar partition_key）

::: warning 不适用范围（必须牢记）
**downlink topic 必须是精确 topic**，不支持模板/通配/regex。  
原因：为了保持可运维的、可预测的订阅行为（避免 wildcard 引入不可控 fan-in）。
详见：[`下行总览`](/northward/downlink/overview)
:::

---

## 2. 基本语法

模板变量使用 <code v-pre>{{var}}</code>：

```text
ng.uplink.{{event_kind}}.{{device_name}}
```

模板引擎使用 Handlebars，并且：

- **非 strict 模式**：缺失变量不会报错，而是渲染为空字符串
- **不做 HTML escaping**：topic/key 是纯文本

::: warning 常见坑：变量缺失导致 topic/key 为空
如果你写了 <code v-pre>{{channel_name}}</code>，但当前数据类型拿不到 `channel_name`，它会变成空字符串。  
建议用 `default` helper 提供兜底值（见下文）。
:::

---

## 3. `default` helper

语法：

```text
{{default value "fallback"}}
```

示例：

```text
ng.uplink.{{event_kind}}.{{default device_type "unknown"}}.{{device_name}}
```

当 `value` 不存在、为 `null` 或为空字符串时，将使用 `fallback`。

---

## 4. 模板变量从哪里来

模板变量来自运行时渲染上下文（RenderContext），不同事件类型可用字段略有差异。完整变量表见：

- [`模板变量表`](/northward/templates/variables)

---

## 5. 推荐的 topic/key 规划

### 5.1 topic 用来表达“路由维度”

优先把“路由/隔离”维度放在 topic 上，例如：

```text
ng.uplink.{{event_kind}}.{{device_name}}
```

或按业务域/租户拆分（如果你在 App 层做了隔离）：

```text
tenant.{{app_id}}.ng.uplink.{{event_kind}}.{{device_name}}
```

### 5.2 key 用来表达“分区与有序性”

Kafka/Pulsar 的 key/partition_key 会影响分区：

- 想按设备有序：<code v-pre>{{device_id}}</code> 或 <code v-pre>{{device_name}}</code>
- 想按点位有序：通常不建议（分区过细会影响吞吐）

更深入建议：

- Kafka：[`分区与有序性（Kafka）`](/northward/kafka/partitions)
- Pulsar：[`分区与有序性（Pulsar）`](/northward/pulsar/partitions)

