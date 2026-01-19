---
title: '最佳实践：架构与隔离'
description: '如何用多个 App、不同队列/重试策略实现隔离与可预期的可靠性；如何避免一个慢消费者拖垮系统。'
---

## 1. 一条原则：把“不可控”限制在最小边界

北向最常见的事故模式是：

> 某个平台消费变慢 / 断链 → backlog 堆积 → 网关内存/CPU 被拖垮 → 采集链路也受影响

产品级的做法是：把风险限制在“一个 App”里，并用策略做降级。

---

## 2. 推荐的 App 拆分方式（强烈建议）

### 2.1 高价值低频（控制面/告警/关键事件）

- 单独 App
- `QueuePolicy.dropPolicy=Block`（小 `blockDuration`）
- 更大的 `capacity` 与更长的 `RetryPolicy` 窗口
- 目标：尽量不丢

### 2.2 低价值高频（遥测）

- 单独 App
- `QueuePolicy.dropPolicy=Discard`
- 目标：保护网关稳定性（宁可丢也别拖垮）

---

## 3. Topic 规划建议（隔离 + 可运维）

不要把一切都写进一个 topic。

- 按事件类型分（telemetry/attributes/…）
- 按环境/租户分（dev/staging/prod）
- 按业务域分（site/line/area）

模板语法与变量表见：

- [`模板语法（Handlebars）`](/northward/templates/handlebars)
- [`模板变量表`](/northward/templates/variables)

---

## 4. 下行（控制面）建议

- 控制面 topic **必须精确订阅**（无 wildcard）
- **一个 topic 承载一种控制消息** 最简单
- 如果混合：用 EnvelopeJson 的 `event.kind` 做路由，或 MappedJson + filter

见：[`下行总览`](/northward/downlink/overview)

