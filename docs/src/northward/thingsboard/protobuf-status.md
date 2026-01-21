---
title: 'Protobuf 状态说明（当前版本不支持）'
description: 'ThingsBoard 插件虽提供 message_format=protobuf 配置，但当前实现未完成；本文说明现状与替代方案。'
---

## 1. 现状（按代码实现）

`communication.message_format` 支持：

- `json`（默认，已实现）
- `protobuf`（配置存在，但当前版本未实现）

当你配置为 `protobuf` 时，插件会返回错误：

::: warning
`Protobuf format not yet implemented`
:::

---

## 2. 替代方案（当前版本推荐）

- 使用 `json` 格式跑通链路
- 如对带宽/CPU 有强约束：
  - 优先在 Kafka/Pulsar 插件上选择更紧凑的 payload（Kv/TimeseriesRows）
  - 或在平台侧做压缩与批处理

---

## 3. Roadmap

Protobuf/二进制 payload 属于后续能力计划，见：[`路线图`](/guide/introduction/roadmap)

