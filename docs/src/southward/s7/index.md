---
title: '西门子 S7'
description: 'NG Gateway Siemens S7 南向驱动使用与配置：CPU/TSAP/PDU 协商、S7 地址语法、数据类型映射与最佳实践。'
---

## 1. 协议介绍

西门子 S7 协议（常见为 S7Comm over ISO-on-TCP，端口 102）是西门子公司推出的一种协议，主要用于与西门子 S7 系列 PLC 进行通信，广泛用于 S7-200/300/400/1200/1500/LOGO 等 PLC 的变量读写。

NG Gateway S7 驱动作为 **客户端** 连接 PLC，通过地址表达式读取/写入 PLC 内存区（I/Q/M/DB/T/C 等）。

## 2. 配置模型

### 2.1 Channel（通道）配置

Channel 是一个 PLC 连接会话边界：**一个 Channel 对应一个 PLC（或一个 PLC 的一个网络入口）**。

#### 2.1.1 `cpu`（CPU 类型）

用于选择握手/参数差异与默认 TSAP 策略：

- S7200 / S7200Smart / S7300 / S7400 / S71200 / S71500 / Logo0BA8

::: tip 建议
尽量选择真实 CPU 型号；选错可能会导致握手失败或读写异常。
:::

#### 2.1.2 `host` / `port`

- **`host`**：PLC IP/hostname（不含 schema）
- **`port`**：默认 `102`

#### 2.1.3 `tsap.kind`（TSAP 模式）

S7 连接需要 TSAP（Transport Service Access Point）参数。驱动提供两种方式：

- **`rackSlot`**：通过 `rack` + `slot` 派生 TSAP（最常用）
- **`tsap`**：手动指定 `src/dst` TSAP（与第三方设备/网关适配时更常用）

字段：

- `tsap.rack`：机架（默认 0）
- `tsap.slot`：插槽（默认 1）
- 或 `tsap.src` / `tsap.dst`：0..65535

::: tip 最佳实践
- **什么时候用 rack/slot**：
  - S7-1200/1500：通常 rack=0，slot=1（部分机型 slot 可能不同）
  - S7-300/400：取决于机架结构与 CPU 插槽

- **什么时候用显式 TSAP**：
  - 通过第三方网关转发 S7（例如某些工业网关）
  - 现场已知对端 TSAP，且 rack/slot 推导不可靠
:::

#### 2.1.4 PDU/AMQ 协商参数（高级调优）

驱动允许指定“希望的协商值”，以在高点位量场景下减少往返次数、提升吞吐：

- **`preferredPduSize`**：期望 PDU 大小（默认 960，允许 128..8192）
- **`preferredAmqCaller`**：期望 AMQ Caller（默认 8，允许 1..255）
- **`preferredAmqCallee`**：期望 AMQ Callee（默认 80，允许 1..255）

::: tip 最佳实践
- 如果你不确定 PLC 支持能力，保持默认即可（让 PLC 决定）。
- 当点位很多且读写频繁时，可以逐步提高 `preferredPduSize`（比如 960→2048）并观察失败率与平均响应时间。
:::

### 2.2 Device（设备）配置

S7 驱动的 device 驱动配置为空。

::: tip 建模建议
- 一个 Channel 对应一个 PLC 时，通常只需要一个 Device（代表该 PLC）。
- 如果你希望对同一 PLC 做“业务分组”（例如按产线/工段拆分点位集合），可以建多个 Device（逻辑分组），但它们共享同一连接会话。
:::

:::: tip Grouped collection（分组采集）
当同一 Channel 下存在多个业务 Device 时，S7 driver 会启用 **grouped collection**：Collector 会把这些 Device 的点位合并成一次 `collect_data(items)` 调用，驱动在一次批读中读取所有地址，再按 `device_id` 拆分为各自的 `NorthwardData` 输出。
::::

### 2.3 Point（点位）配置

Point 的驱动配置字段：

- **`address`**：S7 地址表达式

### 2.4 Action（动作）配置

Action 用于封装一组“写入变量”的操作；**Action 本身不承载协议细节配置**。

- **关键语义**：S7 的写入目标地址应配置在 **Action 的 `inputs(Parameter)` 上**，即每个参数都通过 `Parameter.driver_config.address` 指定要写入的 S7 地址表达式。
- **为什么这样设计**：一个 Action 往往需要写多个变量（多个地址），Action 只是“操作集合”的抽象；真正可配置、可扩展的协议字段必须落在 Parameter 本体上。

参数级驱动配置字段（每个 input parameter）：

- **`address`**：S7 地址表达式

::: warning 注意
地址语法非常关键，见 [S7地址语法](./addressing.md)。
:::

## 3. 数据类型映射表

本章告诉你：**Point 的 `data_type` / Action Parameter 的 `data_type` 应该怎么选**，才能保证“写进去读得回来、值域一致、不会隐式截断/溢出”。

::: tip 重要
S7 驱动在写入时会从地址表达式推导 `transport_size`（传输大小/底层类型），然后把 `NGValue` 转成对应的 S7 类型。因此 **`address → transport_size` 决定了真实存储类型**，`data_type` 决定了网关侧对外暴露/校验的类型。两者应尽量语义对齐。
:::

| S7 transport size（由 address 推导） | 位宽/长度 | 推荐 DataType | 说明 |
| --- | ---: | --- | --- |
| Bit | 1 bit | Boolean | 最推荐；写入按 bool 语义 |
| Char | 1 byte | String / UInt8 | `String` 取首字符；也可用数值（0..255）写入字符码 |
| Byte | 8 bit | UInt8（或 Binary/Int8） | `Binary` 用于“原始字节”；否则推荐 UInt8 |
| Word | 16 bit | UInt16 | 无符号 16-bit |
| Int | 16 bit | Int16 | 有符号 16-bit |
| DWord | 32 bit | UInt32 | 无符号 32-bit |
| DInt | 32 bit | Int32 | 有符号 32-bit |
| Real | 32-bit float | Float32 | IEEE754 float32 |
| Counter | 16 bit | UInt16 | 计数器常用无符号；如现场约定可用 Int16 |
| String | N bytes | String | 写入要求字符串；读路径也可按 RFC3339 解析为 Timestamp（可选） |
| WString | N bytes | String | 与 String 类似（宽字符串） |
| Date | date | Timestamp / String | 推荐 `Timestamp`（i64 毫秒）或 `String` |
| DateTime / DateTimeLong | datetime | Timestamp / String | 推荐 `Timestamp(ms)`；也可用 Int64/UInt64 表示 epoch ms |
| TimeOfDay | time | Timestamp / String | `Timestamp` 表示当天毫秒（0..86399999） |
| Time / S5Time / Timer | duration | Timestamp / String | `Timestamp` 表示持续时间毫秒 |
