---
title: 'Metrics 与可观测性'
description: 'NG Gateway 可观测性指南：tracing 结构化日志、关键 Metrics 指标体系、告警建议与性能瓶颈定位思路。'
---

# Metrics 与可观测性

可观测性不是“出了问题再加日志”，而是网关架构的一部分：你需要在高吞吐、网络抖动、设备异常的常态下，仍然能回答“哪里慢、为什么慢、丢没丢、还能撑多久”。

## 三类必须具备的观测能力

- **Logs（tracing）**：带上下文字段的结构化日志
- **Metrics**：可聚合的数值指标（吞吐/延迟/队列/错误）
- **Health**：健康检查与依赖状态（northward/storage/certs）

## 关键指标（建议最小集）

- **采集侧**
  - points/s、frames/s
  - 解析错误率（按 driver/device 维度）
  - 设备在线率、重连次数
- **队列与背压**
  - queue depth（每条关键队列）
  - drops（丢弃数）/ blocked time（阻塞时间）
- **北向链路**
  - publish success rate
  - retries/backoff count
  - end-to-end latency（采集→上报）
- **资源**
  - CPU/内存
  - 连接数、任务数、句柄数

> 最佳实践：每条“有界队列”必须配套指标，否则背压是否真正生效无法验证。

## 日志字段建议

至少包含：

- `gateway_id`
- `device_id`
- `driver`
- `channel`
- `trace_id`（或 request_id/command_id）

## 告警建议（起步版）

- 队列长期接近满：下游拥塞或处理能力不足
- publish 成功率下降：网络/鉴权/平台侧限流
- 解析错误率升高：线路噪声、设备异常、参数不匹配

## 下一步阅读

- [`架构概览`](../overview/architecture.md)：背压与队列在架构中的作用
- [`故障排查`](./troubleshooting.md)：定位路径与常见故障模式
