---
title: 'Modbus'
description: 'NG Gateway Modbus 南向驱动使用与配置：TCP/RTU、点位建模、字节序/字序、quantity 计算、批量读写与最佳实践。'
---

## 1. 协议介绍

Modbus 是一种经典的工业现场通信协议，常见形态包括 **Modbus TCP**（以太网）与 **Modbus RTU**（串口/RS-485）。它以“寄存器/线圈”为核心抽象：

- **Coils（线圈）**：bit（通常可读可写）
- **Discrete Inputs（离散输入）**：bit（通常只读）
- **Holding Registers（保持寄存器）**：16-bit 寄存器（通常可读可写）
- **Input Registers（输入寄存器）**：16-bit 寄存器（通常只读）

NG Gateway Modbus 驱动的目标是：在网关侧以高吞吐、低开销方式批量读取/写入点位，并把结果标准化为统一的 `NGValue` 进入北向链路。

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

::: tip
**典型组合**：

- 常见 PLC：`byteOrder=BigEndian`，`wordOrder=BigEndian`
- 部分设备（尤其历史设备）对 32-bit/64-bit 使用“字序交换”：`wordOrder=LittleEndian`

建议在上位机/厂家手册中确认；如果读到的 float 值“明显离谱”，优先排查字节序/字序。
:::

#### 2.1.5 `maxGap` / `maxBatch`（批量读取规划参数）

驱动会对可读点位做批量合并（见 **4. 批量读写计划算法**），以减少 Modbus 请求次数并提升吞吐。

- **`maxGap`**：允许合并的最大地址间隙（默认 10）
- **`maxBatch`**：每个批次的最大 span（寄存器数/线圈数，默认 100）

::: warning 注意
这里的 `maxBatch` 表示“一个 range read 的总数量”，不是“点位个数”。
:::

### 2.2 Device（设备）配置

Device 表示一个从站（Slave）。

- **`slaveId`**：从站 ID

### 2.3 Point（点位）配置

- **`functionCode`**：
  - `ReadCoils(0x01)` / `ReadDiscreteInputs(0x02)`
  - `ReadHoldingRegisters(0x03)` / `ReadInputRegisters(0x04)`
- **`address`**：起始地址（0..65535）
- **`quantity`**：读取数量（线圈 bit 数或寄存器 word 数）

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

对于寄存器类读取，建议按 `data_type` 计算 `quantity`（见 **3. 数据类型映射表**）。例如：

- `Int16/UInt16`：1 word
- `Int32/UInt32/Float32`：2 words
- `Int64/UInt64/Float64/Timestamp`：4 words
- `String/Binary`：按协议定义或设备手册定义长度决定（例如固定 10 words）

> 重要：`quantity` 影响批量合并与解码。如果 quantity 填小了，解码会报“words 不足”；填大了则会读到多余字节（仍可能被正确切片，但会浪费带宽与影响合并策略）。
:::

### 2.4 Action（动作）配置

Action 用于封装一组“写线圈/写寄存器”的操作，适合做成可复用的命令（如“复位”“启动”“写参数”）；**Action 本身不承载协议细节配置**。

- **关键语义**：Modbus 的写入目标（functionCode/address/quantity）必须配置在 **Action 的 `inputs(Parameter)` 上**，即每个参数都通过 `Parameter.driver_config` 指定写入目标与长度。
- **为什么这样设计**：一个 Action 往往需要写多个地址（多个寄存器段/线圈段），Action 只是“操作集合”的抽象；协议字段必须落在 Parameter 本体上。

参数级驱动配置字段（每个 input parameter）：

- **`functionCode`**：
  - `WriteSingleCoil(0x05)` / `WriteMultipleCoils(0x0F)`
  - `WriteSingleRegister(0x06)` / `WriteMultipleRegisters(0x10)`
- **`address`**：起始地址
- **`quantity`**：写入数量（线圈 bit 数或寄存器 word 数）

## 3. 数据类型映射表

### 3.1 寄存器类（0x03/0x04）推荐映射

| DataType | 寄存器数量（quantity） | 说明 |
| --- | ---: | --- |
| Boolean | 1 | `words[0] != 0`（注意：这不是线圈语义，只是把寄存器当 bool） |
| Int8 / UInt8 | 1 | 使用低 16-bit 解析并做范围收敛 |
| Int16 / UInt16 | 1 | 16-bit |
| Int32 / UInt32 | 2 | 32-bit |
| Int64 / UInt64 | 4 | 64-bit |
| Float32 | 2 | IEEE754 |
| Float64 | 4 | IEEE754 |
| Timestamp | 4 | 以 **i64 毫秒**表示 |
| String | N（固定或手册决定） | UTF-8/ASCII，末尾 0 会 trim |
| Binary | N（固定或手册决定） | 原始 bytes |

### 3.2 线圈类（0x01/0x02）推荐映射

| DataType | quantity | 说明 |
| --- | ---: | --- |
| Boolean | 1 | 单 bit |
| 其它 | - | 不建议；如需 bitfield/数组，建议建多个点或在边缘计算层聚合 |

## 4. 批量读写计划算法
- 按 **functionCode 分组**
- 组内按 **address 升序排序**
- 逐点合并为 range read：
  - 相邻点位间的 gap
  - 合并后的 span

### 4.1 你应该如何设置 `maxGap` / `maxBatch`

- **吞吐优先（点位密集、地址连续）**：
  - `maxGap` 小（0~10），`maxBatch` 贴近协议上限（≤125）
- **稳定优先（设备质量一般、链路抖动大）**：
  - `maxBatch` 适当降低（例如 60~100），减少单次失败影响范围
- **RS-485 多从站**：
  - 更建议用更大的采集周期 + 合理退避，而不是把单次 batch 拉得很大

::: warning 注意
线圈与寄存器、不同寄存器类型不会被合并。
:::
