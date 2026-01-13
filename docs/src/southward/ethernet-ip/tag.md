---
title: 'EtherNet/IP Tag 建模与限制'
description: '如何正确填写 tagName，如何处理 Program scope，当前驱动对数组/结构体的限制与替代建模策略。'
---

## 1) Tag 名称怎么写

Point/Action 的 `tagName` 是 PLC 变量名（由 PLC 程序定义）。常见形式：

- **Controller Scope**：`MyTag`
- **Program Scope**：`Program:Main.MyTag`

不同工程命名风格可能不同；建议用厂商工具确认变量路径，并用一个“简单标量 Tag”先验证读写通路。

## 2) 数组 / UDT / 结构体支持现状

当前版本：

- 标量类型：支持
- UDT/结构体/数组等复杂类型：会返回 “Unsupported PlcValue type …”

::: tip
如果你希望网关侧直接支持结构体/数组到 JSON/Binary 的映射，我们可以在后续版本中扩展。
:::
