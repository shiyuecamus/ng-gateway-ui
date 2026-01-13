---
title: 'CJT188'
description: 'NG Gateway CJ/T 188 南向驱动（只读）：使用、配置、运行语义、数据类型映射、DI/field_key（对齐当前实现）。'
---

## 1. 概览与能力边界

CJ/T 188 是国内水/热/燃气等表具常用规约，常见版本为 **CJ/T 188-2004** 与 **CJ/T 188-2018**。链路常见两类：**RS-485（串口）** 与 **串口服务器转 TCP**。

NG Gateway 的 CJ/T188 南向驱动（`ng-driver-cjt188`）是一个以 **DI Schema 驱动解析**为核心的轮询采集驱动

:::: warning 重要（能力边界）
- **只读**：驱动不支持 `execute_action` 与 `write_point`（下行未实现），请不要为该驱动配置任何 Action/写点能力。
- **仅主动采集**：驱动用于 `collection_type = Collection` 场景（由网关调度 `collect_data` 发起读取）。
::::

## 2. 配置模型

### 2.1 Channel（通道）驱动配置

#### 2.1.1 `version`（协议版本）

- **`V2004`**
- **`V2018`**

#### 2.1.2 `connection.type`（连接方式）

- **`Serial`**：串口/RS-485（推荐用于直连 485 总线）
- **`Tcp`**：TCP（串口服务器/网关）

Serial 参数（当 `connection.type = Serial`）：

- **`connection.port`**：串口路径
- **`connection.baud_rate`**：波特率
- **`connection.data_bits`**：数据位（默认 8）
- **`connection.stop_bits`**：停止位（默认 1）
- **`connection.parity`**：校验位

TCP 参数（当 `connection.type = Tcp`）：

- **`connection.host`**：主机
- **`connection.port`**：端口

#### 2.1.3 `max_timeouts`（连续超时触发重连）

该字段直接驱动“超时触发重连”逻辑：

- **`max_timeouts = 0`**：禁用“连续超时触发重连”（但 **IO/Transport 错误仍会触发重连**）
- **`max_timeouts > 0`**：当 `连续请求超时次数` 大于 `max_timeouts` 时，驱动请求 supervisor 断开并重建会话

:::: tip 建议
- 不建议把 `max_timeouts` 设为 1（容易抖动重连），默认 3 通常更稳。
- 如果现场链路抖动大且设备响应慢：优先调大 `connection_policy.read_timeout_ms`，其次再调大 `max_timeouts`。
::::

#### 2.1.4 `wakeup_preamble`（前置唤醒码）

`wakeup_preamble` 是一个 `u8` 数组（默认 `[0xFE, 0xFE, 0xFE, 0xFE]`）。驱动会在**每次发送 CJ/T 188 帧之前**先写入这段字节到链路：

- 适用于一些“需要 0xFE 唤醒”的 RS-485 表具
- 如果明确不需要，可配置为空数组 `[]` 以减少带宽与写入开销

### 2.2 Device（设备）驱动配置

Device 的 `driver_config` 关键字段：

- **`meterType`**：表类型（T，1 字节整数 0..=255）
  - 决定 **表具族（MeterTypeFamily）**：Water/Heat/Gas/Custom
  - 表具族决定 schema 选择：同一个 DI 在不同族可能有不同字段结构
- **`address`**：14 位 hex 字符串，表示 **A6..A0**（`高位在前`）
  - 驱动会自动转换为协议线序 **A0..A6**（`低位字节先传`）

### 2.3 Point（点位）驱动配置

- **`di`**：4 位 hex（2 字节 DI，例如 `901F`）
- **`field_key`**：该 DI schema 中的字段键（例如 `current_flow`、`datetime`）

:::: tip 建模最佳实践
一个 DI 通常包含多个字段（例如 `901F` 同时包含 `current_flow`/`datetime`/`status`）：

- **多字段采集**：建多个 Point，**DI 相同、field_key 不同**
- **性能**：驱动会按 DI 分组读取，同一设备同一 DI 只发起一次请求，然后把结果分发到多个 Point（减少请求次数，吞吐更高）
::::

## 3. 数据类型映射表

### 3.1 Schema DataFormat → “源标量”语义

codec 层先把字节解码为一个“源标量”（decoded scalar），然后再按 Point 的 `data_type + scale` 产出最终 `NGValue`。

| Schema DataFormat | 字节语义 | 源标量类型 | 备注 |
| --- | --- | --- | --- |
| `BCD { decimals }` | BCD 数值（带小数位） | `f64` | 小数位由 schema 固定，Point 不配置 decimals |
| `BCDInteger` | BCD 整数 | `u64` | 适合计数/工时/日期(日)等 |
| `Binary` | 小端无符号整数 | `u64` | 用于 bitset/枚举/计数等 |
| `DateTime` | 7 字节 BCD 时间 | `i64` | 输出为 epoch ms（UTC） |
| `Status` | 2 字节状态位（小端） | `u64` | 语义为 `u16`，便于按位解析 |
| `BCDWithUnit { data_length, decimals }` | BCD 数值 + 1 字节单位码 | `f64` | 单位码当前不随值上报 |

### 3.2 `data_type` 强转矩阵

驱动对每个字段的强转遵循统一规则：**先得到源标量**（`f64/u64/i64`），**应用 scale**（如有），再按 `data_type` 产出最终 `NGValue`。

| 目标 `data_type` | 支持的源标量 | 产出 `NGValue` | 关键语义 |
| --- | --- | --- | --- |
| `Boolean` | `f64/u64/i64` | `Boolean` | `!= 0` 视为 true |
| `Int8/Int16/Int32/Int64` | `f64/u64/i64` | 对应整型 | 有 `scale` 时会做 round() 并做范围校验；无 `scale` 时 `u64/i64` 走整数快速路径（更精确） |
| `UInt8/UInt16/UInt32/UInt64` | `f64/u64/i64` | 对应无符号整型 | 同上；`i64` 转 `UInt*` 需要非负且可表示 |
| `Float32/Float64` | `f64/u64/i64` | 对应浮点 | 有 `scale` 时直接缩放 |
| `String` | `f64/u64/i64` | `String` | 数值转字符串 |
| `Binary` | `f64/u64/i64` | `Binary` | 数值按 **大端**字节序写入 bytes（仅建议用于调试/透传，不建议作为业务值） |
| `Timestamp` | `f64/u64/i64` | `Timestamp` | 表示 **epoch ms**；由 DateTime 解码产出的源标量（`i64`）推荐直接配 `Timestamp` |

:::: warning 注意
`Status` 字段语义是 `u16` bitset。建议 `data_type=UInt16`，再在规则引擎/北向侧按位拆分（例如阀门开关、电池欠压等）。
::::

## 4. 支持的 DI / field_key

驱动内置 schema 数量较大（包含大量区间 DI），建议按“表具族 + DI 范围”理解。完整列表与解释见 `./address-di.md`，此处给出概览：

- **Water/Gas**
  - `901F`
  - `D120..D12B`（12 个）
  - `D200..D2FF`（256 个）
  - `D300..D3FF`（256 个，定时冻结）
  - `D400..D4FF`（256 个，瞬时冻结）
- **Heat**
  - `901F`
  - `911F`
  - `D120..D12B`
  - `D200..D2FF`
- **Common（所有表具族通用）**
  - `907F`、`8102`、`8103`、`8104`、`8105`

## 5. 典型建模示例

### 5.1 水表/燃气 `901F`：同时采集累积量、时间、状态

建议建 3 个 Point（同一设备同一 DI，只读一次）：

- `di=901F` + `field_key=current_flow` + `data_type=Float64`（建议 `unit=m³`）
- `di=901F` + `field_key=datetime` + `data_type=Timestamp`
- `di=901F` + `field_key=status` + `data_type=UInt16`

### 5.2 冻结数据 `D3XX/D4XX`：时间 + 累积量 + 瞬时量

Water/Gas 的冻结 DI 会产出 `freeze_datetime`（建议 `Timestamp`）、`cumulative_flow`、`flow_rate`、`temperature`、`pressure` 等字段；建议优先用 `Float64` 承载数值字段。

## 6. 故障排查

- **读不到数据 / 频繁超时**：
  - 优先增大 `connection_policy.read_timeout_ms`
  - 确认串口参数与现场一致；必要时保留默认 `wakeup_preamble`
  - 合理设置 `max_timeouts`（过小会抖动重连）
- **日志提示 “No schema found”**：
  - 确认 `meterType` 是否正确（表具族决定 schema 选择）
  - 确认 DI 是否在当前实现支持范围（见 [`address-di.md`](./address-di.md)）
- **日志提示 “Point value not produced”**：
  - `field_key` 可能拼写错误，或不属于该 DI/表具族
