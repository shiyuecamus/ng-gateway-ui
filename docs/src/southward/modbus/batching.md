---
title: 'Modbus 批量读写计划与性能调优'
description: '解读 Modbus 驱动的批量合并算法（maxGap/maxBatch），以及在 RS-485/TCP 场景下的吞吐与稳定性调参建议。'
---

## 批量合并发生在什么阶段

当 Channel 以 Polling 模式轮询采集时，驱动会对每个 Device 的可读点位做批量规划，尽可能把多个点位合并成更少的 Modbus 请求。这个过程完全在内存中进行（`Planner` 模块），不产生网络 I/O。

## 合并算法

对输入点位集合：

1. **分组**：按 `functionCode` 分组（例如 Holding Registers 和 Input Registers 是物理隔离的区域，无法合并）。
2. **排序**：组内按 `address` 升序排序。
3. **贪婪合并**：从低地址开始扫描，尝试把相邻的点位“吸纳”进当前 Batch：
   - **Gap 检查**：`(next_point.start - current_batch.end) <= maxGap`
   - **Span 检查**：`(next_point.end - current_batch.start) <= maxBatch`

如果两个条件都满足，则合并，批次的 `end` 扩展到 `max(current_batch.end, next_point.end)`。

合并后，驱动会：
- 发送一个读请求（起始地址 + quantity=span）。
- 收到响应后，在内存中根据每个点位的 `address` 和 `quantity` 从大块数据中**零拷贝切片**（Slicing）并解码。

## `maxGap` / `maxBatch` 如何设置

### 1) 吞吐优先（地址密集、设备可靠）

- **`maxGap`**: 10~20
- **`maxBatch`**: 100~120 (Modbus PDU 最大约 250 字节，读寄存器上限约 125 words)

**效果**：
- 请求次数最少，总线利用率最高（减少了协议头开销）。
- 适合 Modbus TCP 或波特率较高的 RS-485 环境。

**风险**：
- 如果设备中间有“非法地址”且正好落在 Gap 中，部分老旧设备可能会返回 Exception 导致整个 Batch 失败。
- 单次响应包较大，对抗干扰能力稍弱。

### 2) 稳定优先（链路抖动、设备偶发超时）

- **`maxGap`**: 0 (禁止跨越未定义的地址)
- **`maxBatch`**: 40~60

**效果**：
- 只有连续定义的点位才合并。
- 单次失败影响范围小，重试成本低。
- 适合长距离 RS-485 线、干扰严重的现场。

### 3) RS-485 多从站（共享总线）

RS-485 的瓶颈往往是总线时分与从站响应时间，而不是 CPU：

- **不要盲目拉大 `maxBatch`**：过大的包会占用总线过久，增加误码率。
- **增大采集周期 (`period`)**：给总线“喘息”时间。
- **配置 `connection_policy`**：
  - `read_timeout_ms`: 至少设置为 `(预期传输时间 + 设备处理时间) * 1.5`。
  - `backoff`: 设置退避策略，避免多个设备同时掉线后“惊群重试”彻底堵死总线。

## 常见问题排查

### 1) “点位都超时/偶尔全失败”

优先排查：
- `read_timeout_ms` 太小（串口/设备响应慢）。
- 从站实际 `slaveId` 与配置不一致。
- RS-485 现场接线/终端电阻/偏置电阻/屏蔽接地问题。

### 2) “吞吐低，请求太多”

优先排查：
- 点位 `functionCode` 分散（同一物理区尽量统一用寄存器区）。
- 单点 `quantity` 太大导致合并被阻断（建议拆分）。
- `maxGap` 设为了 0，导致地址即使只差 1 也无法合并。
