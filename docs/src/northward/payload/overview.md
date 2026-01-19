---
title: '上行 Payload 总览'
description: '北向上行支持四种 payload：EnvelopeJson、Kv、TimeseriesRows、MappedJson。本文给出选型与注意事项。'
---

## 1. 你应该选哪一种

| 模式 | 适用场景 | 优点 | 缺点/注意 |
| --- | --- | --- | --- |
| **EnvelopeJson**（默认推荐） | 长期对接、版本演进、混合事件（Telemetry/Attributes/上下线等） | **语义稳定**、可扩展、便于排障 | 体积相对更大（字段名重复） |
| **Kv** | 只关心 Telemetry/Attributes，想要更“紧凑可读” | 结构简单 `{ts_ms, values}` | 当前仅适用于 Telemetry/Attributes；建议不要用于设备上下线等事件 |
| **TimeseriesRows** | 数据湖/TSDB 摄取（行式） | 便于批量写入，易于落表 | 输出是数组，平台侧需要按 row 处理 |
| **MappedJson** | 平台字段/结构不匹配，需要声明式改造 | 无需写代码即可变形 | 需要理解 JMESPath；规则复杂时可读性下降 |

::: tip 经验法则
- 对接初期：用 **EnvelopeJson**（最容易排障）
- 追求吞吐/落湖：用 **TimeseriesRows** 或 **Kv**
- 需要对接平台自定义结构：用 **MappedJson**（未来可升级为 Lua Transform）
:::

---

## 2. 四种模式的文档入口

- EnvelopeJson：[`EnvelopeJson（稳定包络）`](/northward/payload/envelope-json)
- Kv：[`Kv（ts + values）`](/northward/payload/kv)
- TimeseriesRows：[`TimeseriesRows（行式）`](/northward/payload/timeseries-rows)
- MappedJson：[`MappedJson（JMESPath 映射）`](/northward/payload/mapped-json)

---

## 3. 与模板/分区的关系

payload 负责“消息体长什么样”，topic/key 负责“消息去哪儿、如何分区”：

- 模板语法：[`模板语法（Handlebars）`](/northward/templates/handlebars)
- 模板变量：[`模板变量表`](/northward/templates/variables)

