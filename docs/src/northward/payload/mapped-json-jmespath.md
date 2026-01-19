---
title: 'JMESPath 速查（MappedJson）'
description: '为 MappedJson 提供常用 JMESPath 写法速查与示例。'
---

## 1. 基础选择

- 取字段：`device.name`
- 取嵌套字段：`app.plugin_type`
- 取数组第一个：`data.values[0]`

## 2. 过滤与投影（常用）

- 过滤：`items[?type=='telemetry']`
- 投影：`items[].name`

## 3. 组合输出的常见方式

JMESPath 返回 JSON 值，你可以直接把结果写到某个 out_path。

::: tip
如果你发现“想拼字符串/做复杂计算”，这通常意味着你需要更强的 Transform（未来 Lua Sandbox）。  
可以先把必要字段都输出到 JSON，再在平台侧处理。
:::

