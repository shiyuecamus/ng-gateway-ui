---
title: 'Modbus 批量读写计划与性能调优'
description: '解读 Modbus 驱动的批量合并算法（maxGap/maxBatch），以及在 RS-485/TCP 场景下的吞吐与稳定性调参建议。'
---

## 批量合并发生在什么阶段

当 Channel 以 Polling 模式轮询采集时，驱动会对每个 Device 的可读点位做批量规划，尽可能把多个点位合并成更少的 Modbus 请求。

## 合并算法

对输入点位集合：

- 按 `functionCode` 分组（不同功能码不可合并）
- 组内按 `address` 升序排序
- 从低地址开始扫描，把相邻点位合并成一个 range read：
  - 相邻点位之间的地址间隙 `gap <= maxGap`
  - 合并后整体 span（`start..end`）的长度 `<= maxBatch`

合并后，驱动会：

- 发送一个读请求（起始地址 + quantity=span）
- 收到响应后在本地按点位 `address/quantity` 切片并解码

## `maxGap` / `maxBatch` 如何设置

### 1) 吞吐优先（地址密集、设备可靠）

- `maxGap`: 0~10（偏小）
- `maxBatch`: 100~125（贴近协议常见上限）

效果：请求次数最少、吞吐最高。

风险：一次响应失败影响的点位范围更大。

### 2) 稳定优先（链路抖动、设备偶发超时）

- `maxGap`: 0~5
- `maxBatch`: 60~100

效果：单次失败影响范围更小，重试成本更低。

### 3) RS-485 多从站（共享总线）

RS-485 的瓶颈往往是总线时分与从站响应时间，而不是 CPU：

- 不建议盲目把 `maxBatch` 拉满
- 更建议：
  - 增大采集周期（`period`）
  - 合理设置 `read_timeout_ms`
  - 使用 `connection_policy.backoff` 做退避重连，避免“惊群重试”拖垮总线

## 常见问题排查

### 1) “点位都超时/偶尔全失败”

优先排查：

- `read_timeout_ms` 太小（串口/设备响应慢）
- 从站实际 slaveId 与配置不一致
- address 体系不一致（0/1 基问题）
- RS-485 现场接线/终端电阻/偏置电阻/屏蔽接地问题

### 2) “吞吐低，请求太多”

优先排查：

- 点位 `functionCode` 分散（同一物理区尽量统一用寄存器区）
- 单点 `quantity` 太大导致合并被阻断（建议拆分）
- `maxGap/maxBatch` 过小（保守配置）


