---
title: 'IEC 60870-5-104'
description: 'NG Gateway IEC 60870-5-104 南向驱动：链路/会话参数、CA/IOA/TypeID 建模、上送解析与写命令最佳实践。'
---

## 1. 协议介绍

IEC 60870-5-104（简称 IEC104）是电力自动化领域常见的远动规约，基于 TCP（默认端口 2404）。它以 ASDU（Application Service Data Unit）承载遥信/遥测/累计量/事件等信息对象，并支持遥控/遥调/总召/对时等命令。

NG Gateway IEC104 驱动以 **单 Channel 单 TCP 会话** 的方式运行，核心数据路径是`Driver Push`：

- 上送（遥测/遥信/累计量等）：驱动接收 ASDU 并通过 publisher 推送到北向链路
- 下行（遥控/设点/比特串等）：通过 WritePoint 或 Action 触发命令发送

## 2. 配置模型

### 2.1 Channel（通道）配置

#### 2.1.1 基础连接

- **`host`**：远端站 IP/hostname
- **`port`**：端口，默认 2404

#### 2.1.2 高级链路参数（t0/t1/t2/t3/k/w）

IEC104 的稳定性与吞吐很大程度取决于链路层的定时器与窗口：

- **`t0Ms`**：连接建立/确认超时
- **`t1Ms`**：I 帧确认超时（未收到确认的等待时间）
- **`t2Ms`**：S 帧确认聚合超时（ack 发送延迟窗口）
- **`t3Ms`**：空闲测试帧间隔（保持链路活性）
- **`kWindow`**：最大未确认 I 帧窗口
- **`wThreshold`**：确认阈值（达到阈值触发确认）

此外还有一组“队列与背压”参数：

- **`sendQueueCapacity`**：发送队列容量
- **`maxPendingAsduBytes`**：待处理 ASDU 字节上限（背压/内存预算）
- **`discardLowPriorityWhenWindowFull`**：窗口满时丢弃低优先级
- **`mergeLowPriority`**：低优先级合并（只保留最后值）
- **`lowPrioFlushMaxAgeMs`**：低优先级刷新最大延迟
- **`tcpNodelay`**：禁用 Nagle（降低小包延迟）

> 进阶解释与调参建议见 `./link-timers.md`。

#### 2.1.3 启动总召参数

- **`startupQoi`**：启动总召 QOI（默认 20）
- **`startupQcc`**：启动电能总召 QCC（默认 5）

### 2.2 Device（设备）配置

IEC104 中 CA（Common Address）用于区分站/间隔（按现场定义）。NG Gateway 将 **CA 建模为 Device 级配置**：

- **`ca`**：公共地址（1..65535）

::: tip 建模建议
- 如果一个 TCP 连接下承载多个 CA（常见于站端/集控侧），建议每个 CA 建一个 Device，便于北向分组与权限隔离。
- 同一 CA 下不同 IOA/TypeID 建模为不同 Point。
:::

### 2.3 Point（点位）配置

Point 驱动配置字段：

- **`ioa`**：信息对象地址（0..65535）
- **`typeId`**：ASDU TypeID（UI 以枚举选择）

> 关键：驱动用 `(typeId, ioa)` 作为索引匹配上送数据，只有完全匹配才会落到点位上。

### 2.4 Action（动作）配置

Action 用于封装一组“下行命令”的操作；**Action 本身不承载协议细节配置**。

- **关键语义**：IEC104 的下行命令目标 `(typeId, ioa)` 必须配置在 **Action 的 `inputs(Parameter)` 上**，即每个参数都通过 `Parameter.driver_config.typeId` 与 `Parameter.driver_config.ioa` 指定要下发的命令类型与 IOA。
- **为什么这样设计**：一个 Action 往往需要下发多个 IOA（例如一次下发多个遥控/设点），Action 只是“操作集合”的抽象；协议字段必须落在 Parameter 本体上。

参数级驱动配置字段（每个 input parameter）：

- **`ioa`**：信息对象地址（0..65535）
- **`typeId`**：命令类 TypeID（例如 C_SC/C_DC/C_SE/...）

## 3. 数据类型映射表

驱动接收 ASDU 后，会按 TypeID 解码，并用 `ValueCodec` 将原始值强制转换为 Point 声明的 `data_type`（同时应用 `scale`）。

| 上送 TypeID（点位 typeId） | 原始值来源 | 原始值类型 | 推荐 DataType |
| --- | --- | --- | --- |
| M_SP_*（单点） | `siq.spi()` | bool | Boolean |
| M_DP_*（双点） | `diq.spi().value()` | u8（0..3） | UInt8/UInt16（或按现场约定映射） |
| M_BO_*（32bit 串） | `bsi` | u32 | UInt32 |
| M_ST_*（步进） | `vti.value()` | i8/i16（按实现） | Int16 |
| M_ME_NA/ND（归一化） | `value()` | f64 | Float32/Float64 |
| M_ME_NB（标度化） | `sva` | i16 | Int16/Float32 |
| M_ME_NC（短浮点） | `r` | f32 | Float32 |
| M_IT_*（累计量） | `bcr.value` | i32/i64 | Int64/UInt64 |

## 4. 写入/下行命令
- **C_SC_NA_1 / C_SC_TA_1**：Single Command（值应可转为 bool）
- **C_DC_NA_1 / C_DC_TA_1**：Double Command（值应可转为 u8）
- **C_RC_NA_1 / C_RC_TA_1**：Step Command（值应可转为 u8）
- **C_SE_NA_1 / C_SE_TA_1**：Set Point Normal（值应可转为 i16）
- **C_SE_NB_1 / C_SE_TB_1**：Set Point Scaled（值应可转为 i16）
- **C_SE_NC_1 / C_SE_TC_1**：Set Point Float（值应可转为 f32）
- **C_BO_NA_1 / C_BO_TA_1**：Bits String 32 Command（值应可转为 i32）

总召类（可建模为 Action，无需输入值）：

- **C_IC_NA_1**：General Interrogation（使用 `startupQoi`）
- **C_CI_NA_1**：Counter Interrogation（使用 `startupQcc`）

### 4.1 WritePoint / Action Parameter 的 DataType 推荐表（命令类 TypeID → DataType）
::: tip
IEC104 写入侧会对 value 做严格类型转换，因此 **Point/Parameter 的 `data_type` 应尽量与命令期望类型一致**，避免隐式转换失败。
:::

| 命令 TypeID | 推荐 DataType | value 是否使用 | 说明 |
| --- | --- | --- | --- |
| C_SC_NA_1 / C_SC_TA_1 | Boolean | ✅ | Single Command（bool） |
| C_DC_NA_1 / C_DC_TA_1 | UInt8 | ✅ | Double Command（u8，取值范围按现场约定） |
| C_RC_NA_1 / C_RC_TA_1 | UInt8 | ✅ | Step Command（u8） |
| C_SE_NA_1 / C_SE_TA_1 | Int16 | ✅ | Set Point Normal（i16） |
| C_SE_NB_1 / C_SE_TB_1 | Int16 | ✅ | Set Point Scaled（i16） |
| C_SE_NC_1 / C_SE_TC_1 | Float32 | ✅ | Set Point Float（f32） |
| C_BO_NA_1 / C_BO_TA_1 | Int32 | ✅ | Bits String 32（i32） |
| C_IC_NA_1 | UInt8（任意） | ❌ | General Interrogation：value 会被忽略，但为了触发命令，建议仍定义一个 dummy 参数（ioa 可填 0） |
| C_CI_NA_1 | UInt8（任意） | ❌ | Counter Interrogation：同上（ioa 可填 0） |
