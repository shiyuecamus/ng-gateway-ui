---
title: 'Modbus'
description: 'NG Gateway Modbus 南向驱动使用与配置：TCP/RTU、点位建模、字节序/字序、显式 Transform、批量读写与最佳实践。'
---

## 1. 协议介绍

Modbus 是一种经典的工业现场通信协议，常见形态包括 **Modbus TCP**（以太网）与 **Modbus RTU**（串口/RS-485）。它以“寄存器/线圈”为核心抽象：

- **Coils（线圈）**：bit（通常可读可写）
- **Discrete Inputs（离散输入）**：bit（通常只读）
- **Holding Registers（保持寄存器）**：16-bit 寄存器（通常可读可写）
- **Input Registers（输入寄存器）**：16-bit 寄存器（通常只读）

驱动将原生 ADU/CRC/TID 处理交给 `tokio-modbus`。纯原始地址规划、完整寄存器字段布局留在本地模块，SDK 转换与实际传输 owner 留在适配层。

## 2. 配置模型

### 2.1 Channel（通道）配置

Channel 是“连接与会话”的边界：**同一条 TCP 连接或同一条 RS-485 串口线**应建模为一个 Channel。

#### 2.1.1 `connection.kind`（连接方式）

- **tcp**：Modbus TCP
- **rtu**：Modbus RTU（串口）

#### 2.1.2 TCP 参数（当 `connection.kind = tcp`）

- **`connection.host`**：远端主机（IPv4 或 hostname，不含 schema/端口）
- **`connection.port`**：端口，默认 `502`

::: tip 建议

- 现场设备多为固定 IP，建议直接填写 IP；避免 DNS 解析引入额外不确定性。:::

#### 2.1.3 RTU 参数（当 `connection.kind = rtu`）

- **`connection.port`**：串口路径
  - Linux 示例：`/dev/ttyUSB0`
  - Windows 示例：`COM3`
- **`connection.baudRate`**：波特率（默认 9600）
- **`connection.dataBits`**：数据位（必须为8）
- **`connection.stopBits`**：有校验时为1；无校验时为2
- **`connection.parity`**：None/Odd/Even，界面默认 Even；标准 RTU 字符为8E1、8O1或8N2

#### 2.1.4 `byteOrder` / `wordOrder`（字节序/字序）

Modbus 寄存器为 16-bit word；当点位数据类型为 32/64-bit 时，会跨多个寄存器。不同设备对“字节序/字序”实现存在差异：

- **`byteOrder`**：寄存器内部两个字节的顺序（BigEndian/LittleEndian）
- **`wordOrder`**：多寄存器时 word 的顺序（BigEndian/LittleEndian）

::: tip **典型组合**：

- 常见 PLC：`byteOrder=BigEndian`，`wordOrder=BigEndian`
- 部分设备（尤其历史设备）对 32-bit/64-bit 使用“字序交换”：`wordOrder=LittleEndian`

建议在上位机/厂家手册中确认；如果读到的 float 值“明显离谱”，优先排查字节序/字序。:::

#### 2.1.5 实际 owner 与等待工作

每个 channel 持有一个原生 TCP 连接或 RTU 总线。`maxPendingOperations` 默认32，限制运行与等待的操作数；`maxPendingBytes` 默认33554432，在排队准入前预留原生计划/值字节预算。等待期间也受原始 deadline 和取消约束。`tcpPoolSize`、`maxTimeouts` 已移除并拒绝准入；正在执行的事务不完整时立即销毁其 context。

#### 2.1.6 批量读取规划参数

| 字段 | 作用范围 | 默认值 | 说明 |
| --- | --- | --: | --- |
| `maxBatchRegisters` | 0x03/0x04（寄存器读） | 120 | 单次读请求的最大 span（word 数）。严格为1..125 |
| `maxGapRegisters` | 0x03/0x04（寄存器读） | 8 | 合并相邻点位允许跨越的最大“空洞”（word 地址差） |
| `maxBatchBits` | 0x01/0x02（bit 读） | 2000 | 单次读请求的最大 span（bit 数）。**协议硬上限 <=2000** |
| `maxGapBits` | 0x01/0x02（bit 读） | 500 | 合并相邻点位允许跨越的最大“空洞”（bit 地址差） |

::: warning `maxBatch*` 表示“一个 range read 的总数量”（span），不是“点位个数”。:::

### 2.2 Device（设备）配置

Device 表示一个从站（Slave）。

- **`slaveId`**：Unit ID（TCP1..255；RTU1..247；广播不准入）

#### 2.2.1 Group collection

Modbus driver 在 Polling 采集路径下启用 **group collection**，分组 key 为 `slaveId`：

- **同一 `slaveId`**：Collector 会把多个业务 Device 合并成一次 `collect_data(items)` 调用，驱动会合并点位并执行批量读（读请求数更接近理论最小），随后再按业务 `device_id` 拆分为各自的 `NorthwardData` 输出。
- **不同 `slaveId`**：会被拆成不同的 group 分别采集。

### 2.3 Point（点位）配置

- **`functionCode`**：
  - `ReadCoils(0x01)` / `ReadDiscreteInputs(0x02)`
  - `ReadHoldingRegisters(0x03)` / `ReadInputRegisters(0x04)`
- **`address`**：起始地址（0..65535，**0基**）
- **`quantity`**：读取数量（线圈 bit 数或寄存器 word 数）

#### 2.3.1 wire/logical data type 与 Transform（必读）

Modbus 的 `dataType` 是 **wire data type（协议/内存布局语义）**：它决定 driver 如何从寄存器/线圈解码与如何写回。

如果你希望北向看到的是“工程值”（例如寄存器里是放大整数），请使用 Point 的 **Transform**（logical 语义）：

- `transformDataType`：logical data type（不填则 logical=wire）
- `transformScale/transformOffset/transformNegate`：数值仿射变换

::: tip 推荐阅读完整解释、上行/下行链路、min/max 值域、以及大整数/非数值限制，见：  
[数据类型与Transform 配置](../data-types-transform.md)。:::

::: tip address 的 0/1 基问题（必读）

驱动这里的 `address` 是**协议层的 0 基地址**（UI 校验最小 0）。但很多厂商手册会用 1 基或用 4xxxx/3xxxx 的“逻辑地址”描述。

你需要把手册地址换算到 0 基：

- 如果手册说 **40001 对应第 1 个 Holding Register**，那么协议地址通常是 `0`（40001-40001）。
- 如果手册直接给出“寄存器偏移 0/1”，以手册定义为准。

建议用一个“已知固定值”的点位做校验（例如设备型号/固件版本寄存器），先把 address 体系校准，再批量建模。:::

::: tip quantity 如何计算

`quantity` 的含义取决于 `functionCode`：

- **Coils/DiscreteInputs**：单位是 **bit**（线圈数量）
- **Holding/InputRegisters**：单位是 **word（16-bit）**

寄存器标量 quantity 必须精确匹配 wire 类型。缺少 quantity、quantity=0、宽度不符均在 I/O 前拒绝。变长字段跨 PDU 完整组装，不截取前缀或自动提升类型。:::

### 2.4 Action（动作）配置

Action 用于封装一组“写线圈/写寄存器”的操作。

- **`functionCode`**：
  - `WriteSingleCoil(0x05)` / `WriteMultipleCoils(0x0F)`
  - `WriteSingleRegister(0x06)` / `WriteMultipleRegisters(0x10)`
- **`address`**：起始地址
- **`quantity`**：写入数量

::: tip 自动功能码推断对于北向的 `write_point`（单点写入）操作，如果点位定义的是读功能码（如 `ReadHoldingRegisters`），驱动会自动根据 `quantity` 推断使用写功能码：

- `quantity = 1` -> `WriteSingleRegister` (0x06)
- `quantity > 1` -> `WriteMultipleRegisters` (0x10) :::

## 3. 数据类型映射表 (Smart Codec)

驱动内置了强大的编解码器，支持从寄存器流到强类型值的灵活转换。

### 3.1 寄存器类（0x03/0x04）

| wire `dataType` | 精确 quantity | 行为 |
| --- | --: | --- |
| Boolean、Int16、UInt16 | 1 | 完整16位 word |
| Int32、UInt32、Float32 | 2 | 完整32位标量 |
| Int64、UInt64、Float64、Timestamp | 4 | 完整64位标量；Timestamp 为有符号毫秒时间戳 |
| String、Binary | 显式 N | 完整原始字段，可跨 PDU 组装 |

UInt8/Int8 字节槽及 Int128 wire 字段未准入。逻辑整数类型转换使用明确支持的 wire 类型与 `transformDataType`。浮点 NaN/infinity、超出2^53整数的非安全仿射转换均拒绝。

::: warning String 点位的“定长块 + 填充”约定（必读）Modbus 协议本身并没有“字符串寄存器”类型，`String` 的读取完全依赖**设备侧的数据存放约定**。当前驱动对 `String` 的行为是：

- 会按 `byteOrder/wordOrder` 把 `quantity` 个寄存器还原成字节流；
- 然后仅**去除末尾连续的 `0x00`**（去掉尾部 `\0` 填充），再按 UTF-8 解码（无效 UTF-8 直接拒绝）。

因此你需要特别注意：

- **`quantity` 必须足够**：单位是寄存器（word，2 字节）。例如“字符串长度 10 字节”通常需要 `quantity = 5`。
- **设备写入建议“全量覆盖 + 0x00 填充”**：把整段定长寄存器块写满；不足部分用 `0x00` 补齐。
  - 例：定长 10 个寄存器（20 字节）存放 `"a"` 时，建议写入 `0x61 0x00` 后，剩余 18 字节全部补 `0x00`。
- **不要只写 `a\\0` 然后不清空剩余寄存器**：如果尾部存在旧数据且不为 `0x00`，驱动不会在第一个 `0x00` 处截断，可能出现 `"a\\0xxxx..."`（包含不可见字符/脏尾巴），看起来像“字符串不对”。

如果现场设备无法保证清尾，建议在设备侧（或上位机写入侧）统一采用“定长块 0 填充”协议；并先用一个已知字符串寄存器验证 `byteOrder/wordOrder` 是否正确。:::

::: details 显式 wire/logical Transform 示例：设备有一个温度值，实际上是 `Int16` (255 = 25.5°C)，但你在平台定义为了 `Float32`。

- 配置（推荐的“wire/logical 语义分离”）：
  - `dataType=Int16`（wire）
  - `transformDataType=Float64`（logical）
  - `quantity=1`
  - `transformScale=0.1`
- 驱动行为：读取 1 个 word -> 解析为 i16(wire) -> wire→logical 应用 Transform -> 输出 25.5 :::

### 3.2 线圈类（0x01/0x02）

| DataType    | quantity | 说明        |
| ----------- | -------: | ----------- |
| **Boolean** |        1 | 单 bit 读写 |

每个线圈/离散输入点位必须为单个 Boolean，quantity=1。数组未准入。

## 4. 批量读写计划算法

纯规划器统一准入完整 Unit ID 分组，按功能码/地址确定性排序，先合并原始范围并集，再分割为合法 PDU。alias 共用原始读取，完整组装字段后才执行 byte/word order 和一次 SDK Transform。`maxGap*` 统计未绑定地址数，所以0允许重叠和相邻。非法限制直接拒绝。

工作预算默认 `maxPlanningInputs=4096`、`maxPlanningReferences=65536`、`maxCollectionBytes=16777216`。任一 PDU 失败会使逻辑采集失败，缓冲初始值不会发布。详见[批量规划](./batching.md)。

### 4.1 性能调优建议

- **高吞吐模式**：
  - 寄存器：`maxGapRegisters` = 1~10，`maxBatchRegisters` = 100~125
  - bit：`maxGapBits` = 16~200，`maxBatchBits` = 512~2000
  - 适用：点位地址集中，网络质量好（TCP）。

- **高稳定性模式**：
  - 寄存器：`maxGapRegisters` = 0（不跨越空洞），`maxBatchRegisters` = 40~80
  - bit：`maxGapBits` = 0（不跨越空洞），`maxBatchBits` = 128~512
  - 适用：RS-485 干扰大，设备响应慢。

## 破坏式迁移

为每个字段显式配置 quantity 和精确标量宽度，删除旧 `tcpPoolSize`/`maxTimeouts`。Timestamp 使用四个 word 的有符号毫秒；其他设备编码应选择数值 wire 类型与明确的逻辑 Transform。String 严格按 UTF-8 解码，超长写入拒绝。完整准确回显表示服务接受；缺失/错配回显保留不确定性，控制不会自动重放。
