---
title: 'Modbus 批量读写计划与性能调优'
description: '解读 Modbus 驱动的批量合并算法（寄存器/bit 分开：maxBatch*/maxGap*），以及在 RS-485/TCP 场景下的吞吐与稳定性调参建议。'
---

## 完整原始范围规划

同一 Unit ID 分组的全部可读字段在 I/O 前统一准入。规划按原始功能码/地址排序，先合并重叠或相邻范围，再把范围并集分割为合法 PDU；不同地址空间分别处理。alias 和嵌套字段共用原始读取，各个逻辑字段完整组装后才进入 SDK 转换。

`maxGap*` 表示两个排他结束地址范围之间的未绑定地址数。0 允许重叠和相邻，禁止跨空洞。`maxBatchRegisters` 必须为1..125，`maxBatchBits` 必须为1..2000；非法配置直接拒绝。允许读取的空洞可能触发设备非法地址异常，稀疏设备地址表应选择0。

## 工作与内存准入

`maxPlanningInputs` 限制原始字段数，`maxPlanningReferences` 限制 PDU 到字段的投影数量，`maxCollectionBytes` 限制完整原始逻辑值字节数；`maxPendingOperations` 限制实际连接/总线上正在运行及等待的操作，`maxPendingBytes` 同时限制原生计划/值预留字节数。过期或取消的排队操作不能取得发送权限。

数值标量布局使用固定栈缓冲；变长字段使用有界的完整组装缓冲。byte/word order 和一次 SDK Transform 都在组装完成后执行。任何 PDU 失败会使逻辑采集失败，缓冲区初始的 false/zero 不会发布为观测值。

## 连接生命周期

每个 channel 持有一个原生 TCP 连接或 RTU 总线，整个逻辑分组独占该 owner。TCP 可以并发调度分组，但实际 wire 请求仍为单飞。RTU 在合法响应和下一请求之间等待 t3.5：波特率不高于19200时为3.5个配置字符，高于19200时为固定1.75ms。

原始 host deadline 覆盖排队与所有 PDU，单 PDU read timeout 只能缩短它。每一次实际 write/flush poll 同时检查原始 deadline、调用方取消及 attempt 取消。正在执行的超时、取消、畸形响应或传输错误会在释放连接前同步销毁带缓冲的原生 context；控制不会自动重放。完整相关的异常响应可以保留干净连接。关闭会取消等待和运行中的操作，并等待原生描述符销毁。

根据设备地址表、响应延迟及串口实际传输时间调整批量参数。本软件调度策略不替代物理 UART/RS-485 时序和电气验收。
