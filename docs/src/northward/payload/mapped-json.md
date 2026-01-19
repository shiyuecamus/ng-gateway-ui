---
title: 'MappedJson（JMESPath 声明式映射）'
description: '把北向内部数据映射为你平台想要的 JSON：compile once, apply many；包含输入视图、规则写法、性能与常见坑。'
---

## 1. 什么时候用 MappedJson

当你遇到以下情况时，MappedJson 是最直接的“产品级”选择：

- 平台字段命名/层级与 NG Gateway 不一致
- 平台需要额外的静态字段（tenant、site、schemaVersion 等）
- 想把 `EnvelopeJson`/`Kv` 的某些字段重排成平台需要的 shape

::: tip 未来演进
后续计划支持 Lua Transform（更强表达力/可测试/可热更新），见：`document/ng-lua-transform-sandbox-design.md` 与 [`路线图`](/guide/other/roadmap)。
:::

---

## 2. 配置形状

MappedJson 的配置是一个 Map：

```json
{
  "out.path": "<jmespath expr>",
  "out2.path": "<jmespath expr>"
}
```

其中：

- **key**：输出路径（用 `.` 分段），例如 `payload.data.device_id`
- **value**：JMESPath 表达式，对“输入视图 JSON”求值

---

## 3. 输入视图（canonical input）

MappedJson 的输入视图是稳定的（所有插件共享），形状如下：

```json
{
  "schema_version": 1,
  "event_kind": "telemetry",
  "ts_ms": 1734870900000,
  "app": { "id": 1, "name": "my-app", "plugin_type": "kafka" },
  "device": { "id": 1001, "name": "dev-1", "type": null },
  "data": { }
}
```

说明：

- `event_kind` 来自内部 EnvelopeKind（与 `EnvelopeJson` 的 `event.kind` 一致）
- `data` 是 `NorthwardData` 的 JSON 表示（Telemetry/Attributes/…）

---

## 4. 示例：把 Telemetry 映射成平台期望结构

目标输出：

```json
{
  "ts": 1734870900000,
  "device": "dev-1",
  "values": { "temp": 25.6 }
}
```

示例配置（仅示意，具体 data 字段以实际 Telemetry JSON 为准）：

```json
{
  "ts": "ts_ms",
  "device": "device.name",
  "values": "data.values"
}
```

::: warning
`data` 的内部结构取决于 `NorthwardData` 的 serde JSON 形状。  
落地插件文档时，我会为 Telemetry/Attributes 给出“真实示例输入”，让用户可以直接写映射规则。
:::

---

## 5. 性能与稳定性建议

- **尽量让规则少而稳定**：规则越多，CPU 开销越高；同时更难排障
- **输出路径尽量扁平**：深层嵌套会增加写入开销与冲突概率
- **避免依赖不稳定字段**：例如依赖某些临时 meta（后续可能演进）

---

## 6. 常见坑

- **JMESPath 表达式写错**：会导致 mapping compile 失败或 eval 失败
- **输出路径冲突**：例如先写了 `a=1`，后写 `a.b=2`（类型冲突）
- **值为 null/空**：平台侧解析失败（建议用平台侧或后续 Lua 逻辑做兜底）

更详细语法速查见：[`JMESPath 速查`](/northward/payload/mapped-json-jmespath)

