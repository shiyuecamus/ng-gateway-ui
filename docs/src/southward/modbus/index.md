---
title: 'Modbus'
description: 'NG Gateway Modbus 南向驱动使用与配置：TCP/RTU、点位建模、字节序/字序、Smart Cast、批量读写与最佳实践。'
---

## 1. 协议介绍

Modbus 是一种经典的工业现场通信协议，常见形态包括 **Modbus TCP**（以太网）与 **Modbus RTU**（串口/RS-485）。它以“寄存器/线圈”为核心抽象：

- **Coils（线圈）**：bit（通常可读可写）
- **Discrete Inputs（离散输入）**：bit（通常只读）
- **Holding Registers（保持寄存器）**：16-bit 寄存器（通常可读可写）
- **Input Registers（输入寄存器）**：16-bit 寄存器（通常只读）

NG Gateway Modbus 驱动采用**全异步、零拷贝**架构，在网关侧以高吞吐、低开销方式批量读取/写入点位。支持**Smart Cast**（智能类型转换）和**自动批量规划**。

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
- 现场设备多为固定 IP，建议直接填写 IP；避免 DNS 解析引入额外不确定性。
:::

#### 2.1.3 RTU 参数（当 `connection.kind = rtu`）

- **`connection.port`**：串口路径
  - Linux 示例：`/dev/ttyUSB0`
  - Windows 示例：`COM3`
- **`connection.baudRate`**：波特率（默认 9600）
- **`connection.dataBits`**：数据位（5/6/7/8，默认 8）
- **`connection.stopBits`**：停止位（1/2，默认 1）
- **`connection.parity`**：校验位（None/Odd/Even，默认 None）

#### 2.1.4 `byteOrder` / `wordOrder`（字节序/字序）

Modbus 寄存器为 16-bit word；当点位数据类型为 32/64-bit 时，会跨多个寄存器。不同设备对“字节序/字序”实现存在差异：

- **`byteOrder`**：寄存器内部两个字节的顺序（BigEndian/LittleEndian）
- **`wordOrder`**：多寄存器时 word 的顺序（BigEndian/LittleEndian）

::: tip **典型组合**：

- 常见 PLC：`byteOrder=BigEndian`，`wordOrder=BigEndian`
- 部分设备（尤其历史设备）对 32-bit/64-bit 使用“字序交换”：`wordOrder=LittleEndian`

建议在上位机/厂家手册中确认；如果读到的 float 值“明显离谱”，优先排查字节序/字序。
:::

#### 2.1.5 `tcpPoolSize`

`tcpPoolSize` 用于提升 Modbus TCP 的吞吐：驱动会维护一个 TCP 连接池，采集时在池内做 round-robin 选择连接，从而允许多个请求并发在飞（仍受 core 并发与驱动内部计划约束）。

- **默认值**：`1`
- **推荐范围**：`1..=32`（过大收益通常不明显，且会增加 PLC/网关资源消耗）

::: warning 
仅对 `connection.kind=tcp` 生效；RTU 会强制单飞（有效值=1）。当你配置 `tcpPoolSize > 32` 时，驱动会在运行时 clamp 到 `32`。
:::

#### 2.1.6 批量读取规划参数

| 字段 | 作用范围 | 默认值 | 说明 |
| --- | --- | ---: | --- |
| `maxBatchRegisters` | 0x03/0x04（寄存器读） | 120 | 单次读请求的最大 span（word 数）。**协议硬上限 <=125**，驱动会 clamp |
| `maxGapRegisters` | 0x03/0x04（寄存器读） | 1 | 合并相邻点位允许跨越的最大“空洞”（word 地址差） |
| `maxBatchBits` | 0x01/0x02（bit 读） | 2000 | 单次读请求的最大 span（bit 数）。**协议硬上限 <=2000** |
| `maxGapBits` | 0x01/0x02（bit 读） | 500 | 合并相邻点位允许跨越的最大“空洞”（bit 地址差） |

::: warning
`maxBatch*` 表示“一个 range read 的总数量”（span），不是“点位个数”。
:::

### 2.2 Device（设备）配置

Device 表示一个从站（Slave）。

- **`slaveId`**：从站 ID (0-255)

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

::: tip 推荐阅读
完整解释、上行/下行链路、min/max 值域、以及大整数/非数值限制，见：  
[数据类型与Transform 配置](../data-types-transform.md)。
:::

::: tip address 的 0/1 基问题（必读）

驱动这里的 `address` 是**协议层的 0 基地址**（UI 校验最小 0）。但很多厂商手册会用 1 基或用 4xxxx/3xxxx 的“逻辑地址”描述。

你需要把手册地址换算到 0 基：

- 如果手册说 **40001 对应第 1 个 Holding Register**，那么协议地址通常是 `0`（40001-40001）。
- 如果手册直接给出“寄存器偏移 0/1”，以手册定义为准。

建议用一个“已知固定值”的点位做校验（例如设备型号/固件版本寄存器），先把 address 体系校准，再批量建模。
:::

::: tip quantity 如何计算

`quantity` 的含义取决于 `functionCode`：

- **Coils/DiscreteInputs**：单位是 **bit**（线圈数量）
- **Holding/InputRegisters**：单位是 **word（16-bit）**

对于寄存器类读取，建议按 `data_type` 计算 `quantity`（见 **3. 数据类型映射表**）。如果 quantity 填小了，驱动会尝试进行 **Smart Cast**（如读取 1 个 word 转为 Float32）；填大了则会进行截断或填充。
:::

### 2.4 Action（动作）配置

Action 用于封装一组“写线圈/写寄存器”的操作。

- **`functionCode`**：
  - `WriteSingleCoil(0x05)` / `WriteMultipleCoils(0x0F)`
  - `WriteSingleRegister(0x06)` / `WriteMultipleRegisters(0x10)`
- **`address`**：起始地址
- **`quantity`**：写入数量

::: tip 自动功能码推断
对于北向的 `write_point`（单点写入）操作，如果点位定义的是读功能码（如 `ReadHoldingRegisters`），驱动会自动根据 `quantity` 推断使用写功能码：
- `quantity <= 1` -> `WriteSingleRegister` (0x06)
- `quantity > 1` -> `WriteMultipleRegisters` (0x10)
:::

## 3. 数据类型映射表 (Smart Codec)

驱动内置了强大的编解码器，支持从寄存器流到强类型值的灵活转换。

### 3.1 寄存器类（0x03/0x04）

| DataType | 推荐 quantity (words) | 解码行为 | Smart Cast (降级兼容) |
| --- | --: | --- | --- |
| **Boolean** | 1 | 第一个 word != 0 即为 true | - |
| **Int16** | 1 | 标准 16-bit 有符号整数 | 读 4 words (i64) 截断为 i16 |
| **UInt16** | 1 | 标准 16-bit 无符号整数 | 读 4 words (u64) 截断为 u16 |
| **Int32** | 2 | 标准 32-bit 有符号整数 | 若 quantity=1，读取 i16 并提升为 i32 |
| **UInt32** | 2 | 标准 32-bit 无符号整数 | 若 quantity=1，读取 u16 并提升为 u32 |
| **Float32** | 2 | IEEE754 单精度浮点 | 若 quantity=1，读取 i16 并转为 f32 |
| **Float64** | 4 | IEEE754 双精度浮点 | 若 quantity=2，读取 f32 并转为 f64 |
| **Int64** | 4 | 标准 64-bit 有符号整数 | 若 quantity=2，读取 i32 并提升为 i64 |
| **UInt64** | 4 | 标准 64-bit 无符号整数 | 若 quantity=2，读取 u32 并提升为 u64 |
| **Timestamp** | **2 或 4** | **4 words (8 bytes)**: 解析为 i64 毫秒时间戳<br>**2 words (4 bytes)**: 解析为 u32 秒级时间戳并自动乘 1000 | - |
| **String** | N | UTF-8 字符串，自动去除末尾 `\0` | - |
| **Binary** | N | 原始字节流 | - |

::: warning String 点位的“定长块 + 填充”约定（必读）
Modbus 协议本身并没有“字符串寄存器”类型，`String` 的读取完全依赖**设备侧的数据存放约定**。当前驱动对 `String` 的行为是：

- 会按 `byteOrder/wordOrder` 把 `quantity` 个寄存器还原成字节流；
- 然后仅**去除末尾连续的 `0x00`**（去掉尾部 `\0` 填充），再按 UTF-8 解码（无效字节会以替代字符显示）。

因此你需要特别注意：

- **`quantity` 必须足够**：单位是寄存器（word，2 字节）。例如“字符串长度 10 字节”通常需要 `quantity = 5`。
- **设备写入建议“全量覆盖 + 0x00 填充”**：把整段定长寄存器块写满；不足部分用 `0x00` 补齐。
  - 例：定长 10 个寄存器（20 字节）存放 `"a"` 时，建议写入 `0x61 0x00` 后，剩余 18 字节全部补 `0x00`。
- **不要只写 `a\\0` 然后不清空剩余寄存器**：如果尾部存在旧数据且不为 `0x00`，驱动不会在第一个 `0x00` 处截断，可能出现 `"a\\0xxxx..."`（包含不可见字符/脏尾巴），看起来像“字符串不对”。

如果现场设备无法保证清尾，建议在设备侧（或上位机写入侧）统一采用“定长块 0 填充”协议；并先用一个已知字符串寄存器验证 `byteOrder/wordOrder` 是否正确。
:::

::: details 
Smart Cast 示例场景：设备有一个温度值，实际上是 `Int16` (255 = 25.5°C)，但你在平台定义为了 `Float32`。

- 配置（推荐的“wire/logical 语义分离”）：
  - `dataType=Int16`（wire）
  - `transformDataType=Float64`（logical）
  - `quantity=1`
  - `transformScale=0.1`
- 驱动行为：读取 1 个 word -> 解析为 i16(wire) -> wire→logical 应用 Transform -> 输出 25.5 
:::

### 3.2 线圈类（0x01/0x02）

| DataType | quantity | 说明 |
| --- | ---: | --- |
| **Boolean** | 1 | 单 bit 读写 |
| **Telemetry/Attribute** | N | 驱动会将读取到的 bit 数组映射到对应的点位上。目前建议每个点位 quantity=1 对应一个 bit。 |

## 4. 批量读写计划算法

驱动内置 `Planner` 模块，负责将散列的点位请求聚合为最优的 Modbus PDU。

1. **分组**：按 `functionCode` 分组（0x03 和 0x04 不能合并）。
2. **排序**：组内按 `address` 升序。
3. **扫描与合并**：
   - 寄存器读（0x03/0x04）：只要 `(next_addr - current_end) <= maxGapRegisters` 且 `(new_end - current_start) <= maxBatchRegisters`，就会合并为一个请求（并受协议上限 clamp）。
   - bit 读（0x01/0x02）：只要 `(next_addr - current_end) <= maxGapBits` 且 `(new_end - current_start) <= maxBatchBits`，就会合并为一个请求。
   - 合并会产生“空洞数据”，这些数据会被读取但在解码阶段丢弃。

### 4.1 性能调优建议

- **高吞吐模式**：
  - 寄存器：`maxGapRegisters` = 1~10，`maxBatchRegisters` = 100~125
  - bit：`maxGapBits` = 16~200，`maxBatchBits` = 512~2000
  - 适用：点位地址集中，网络质量好（TCP）。

- **高稳定性模式**：
  - 寄存器：`maxGapRegisters` = 0（不跨越空洞），`maxBatchRegisters` = 40~80
  - bit：`maxGapBits` = 0（不跨越空洞），`maxBatchBits` = 128~512
  - 适用：RS-485 干扰大，设备响应慢。
