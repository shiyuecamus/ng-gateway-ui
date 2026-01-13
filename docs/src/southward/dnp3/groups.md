---
title: 'DNP3 对象组/索引与命令类型'
description: '如何选择 Point 的对象组与 index，完整性/事件扫描的语义，以及 CROB/模拟量输出等命令的输入值要求。'
---

## 1) Point：对象组（group）与 index

DNP3 的数据点通常由以下几个关键点组成：

- 对象组（Object Group）
- 变体（Variation）
- index

NG Gateway 当前版本简化为：

- **group**：对象组（枚举）
- **index**：索引

常见 group 含义：

- BinaryInput：开关量输入
- DoubleBitBinaryInput：双点开关量输入
- BinaryOutput：开关量输出状态
- Counter：计数器
- FrozenCounter：冻结计数器
- AnalogInput：模拟量输入
- AnalogOutput：模拟量输出状态
- OctetString：字节串

**建模建议**：

- `BinaryInput` / `DoubleBitBinaryInput`：推荐 `data_type=Boolean` 或 `UInt8`（按现场语义）
- `AnalogInput`：推荐 `Float32/Float64`（必要时配 `scale`）
- `Counter` / `FrozenCounter`：推荐 `UInt32/UInt64`
- `OctetString`：推荐 `String` 或 `Binary`

## 2) DataType 与 DNP3 Variation 的映射关系

### 2.1 设计理念

DNP3 协议中，每个对象组（Group）有多个变体（Variation），例如：

| Group | Variation | 含义 |
|-------|-----------|------|
| 30 | 1 | 32-bit Analog Input With Flag |
| 30 | 2 | 16-bit Analog Input With Flag |
| 30 | 3 | 32-bit Analog Input Without Flag |
| 30 | 5 | Single-precision (Float32) With Flag |
| 30 | 6 | Double-precision (Float64) With Flag |

NG Gateway 采用**简化建模**策略：

- **读取方向**：使用 Class Data 请求，让 Outstation 自行决定返回哪个 Variation
- **写入方向**：通过 `DataType` 字段隐式选择对应的 Variation

这种设计的优势：
1. **兼容性最佳**：不同 Outstation 可能支持不同的 Variation
2. **用户友好**：无需深入理解 DNP3 协议细节
3. **符合 IEEE 1815 标准**：Class Data 是推荐的数据请求方式

### 2.2 读取时的 Variation 处理

当 NG Gateway 执行 Integrity Scan 或 Event Scan 时：

```
Master (NG Gateway)                    Outstation
        |                                   |
        |--- READ Class 0/1/2/3 ----------->|
        |    (Group60Var1~4)                |
        |                                   |
        |<-- Response with actual data -----|
        |    (Group30Var1 或 Var5 等)        |
```

- 驱动底层库（dnp3-rs）会将不同 Variation 的响应**统一转换**为标准 Rust 类型
- 例如：`Group30Var1`、`Group30Var5`、`Group30Var6` 都被转换为 `AnalogInput { value: f64, flags: Flags, time: Option<Time> }`
- 您配置的 `DataType` 用于**最终值转换**（如 `f64` → `Int32` 截断）

::: tip 重要
上行路径中，您的 `DataType` 配置不影响请求，只影响最终值的类型转换。
:::

### 2.3 写入时的 Variation 选择

写入命令（WritePoint / Action）时，`DataType` **直接决定**使用哪个 DNP3 Variation：

#### 模拟量输出命令（AnalogOutputCommand - Group 41）

| DataType | DNP3 Variation | 说明 |
|----------|----------------|------|
| `Int16` / `UInt16` | Group41Var2 | 16-bit Analog Output |
| `Int32` / `UInt32` | Group41Var1 | 32-bit Analog Output |
| `Float32` | Group41Var3 | Single-precision Float |
| `Float64` | Group41Var4 | Double-precision Float |

#### CROB 命令（Control Relay Output Block - Group 12）

CROB 始终使用 `Group12Var1`：

| DataType | 值解析 | 说明 |
|----------|--------|------|
| `UInt8`（推荐） | value=u8（Control Code） | 产品级统一语义：下行 value 只接收数值控制码；但网关仅允许明确的安全子集（见 [`crob.md`](./crob.md)） |

### 2.3.1 CROB Control Code 位域语义

在 NG Gateway 当前实现里，CROB 的 `ControlCode` 是一个 **8-bit 位域**，由以下字段组合而成：

- **op_type**：4 bits（低 4 位）
  - 常用：PulseOn / PulseOff / LatchOn / LatchOff
- **queue**：1 bit（第 4 位，标准中已 obsolete，但仍可表示）
- **clear**：1 bit（第 5 位）
- **trip_close_code (TCC)**：2 bits（第 6-7 位）
  - `Nul / Close / Trip`（`Reserved=0b11` 会被网关拒绝）

#### 常用控制码示例

::: warning 说明
下表假设 `tcc=Nul`、`clear=false`、`queue=false`，因此控制码就是 op（低 4 位）。注意网关 **不允许 op=0(Nul)**。

如果你需要 Trip/Close 或 queue/clear，请以网关允许值为准，完整取值表见 [`crob.md`](./crob.md)。
:::

| 语义 | op_type | control_code (十进制) | control_code (十六进制) |
| --- | --- | ---:| ---:|
| PulseOn | PulseOn | 1 | 0x01 |
| PulseOff | PulseOff | 2 | 0x02 |
| LatchOn | LatchOn | 3 | 0x03 |
| LatchOff | LatchOff | 4 | 0x04 |

### 2.4 完整 Variation 参考表

以下是 DNP3 各对象组的主要 Variation 及其用途（供参考）：

#### Binary Input (Group 1/2)

| Group | Var | 类型 | 说明 |
|-------|-----|------|------|
| 1 | 1 | Static | Packed Format (无 flags) |
| 1 | 2 | Static | With Flags |
| 2 | 1 | Event | Without Time |
| 2 | 2 | Event | With Absolute Time |
| 2 | 3 | Event | With Relative Time |

#### Analog Input (Group 30/32)

| Group | Var | 类型 | 说明 |
|-------|-----|------|------|
| 30 | 1 | Static | 32-bit With Flag |
| 30 | 2 | Static | 16-bit With Flag |
| 30 | 3 | Static | 32-bit Without Flag |
| 30 | 5 | Static | Single-precision (f32) With Flag |
| 30 | 6 | Static | Double-precision (f64) With Flag |
| 32 | 1 | Event | 32-bit Without Time |
| 32 | 3 | Event | 32-bit With Time |
| 32 | 5 | Event | Single-precision Without Time |
| 32 | 7 | Event | Single-precision With Time |

#### Counter (Group 20/21/22)

| Group | Var | 类型 | 说明 |
|-------|-----|------|------|
| 20 | 1 | Static | 32-bit With Flag |
| 20 | 2 | Static | 16-bit With Flag |
| 20 | 5 | Static | 32-bit Without Flag |
| 21 | 1 | Frozen | 32-bit With Flag |
| 21 | 5 | Frozen | 32-bit With Flag and Time |
| 22 | 1 | Event | 32-bit With Flag |
| 22 | 5 | Event | 32-bit With Flag and Time |

#### Analog Output (Group 40/41/42)

| Group | Var | 类型 | 说明 |
|-------|-----|------|------|
| 40 | 1 | Status | 32-bit With Flag |
| 40 | 2 | Status | 16-bit With Flag |
| 40 | 3 | Status | Single-precision With Flag |
| 41 | 1 | Command | 32-bit ← **DataType=Int32** |
| 41 | 2 | Command | 16-bit ← **DataType=Int16** |
| 41 | 3 | Command | Single-precision ← **DataType=Float32** |
| 41 | 4 | Command | Double-precision ← **DataType=Float64** |
| 42 | 7 | Event | Single-precision With Time |

## 3) 扫描语义：Integrity vs Event

驱动会定期执行：

- Integrity Scan：获取"全量快照"（Class 0/1/2/3）
- Event Scan：获取"事件变化"（Class 1/2/3）

两者的差异取决于 Outstation 配置与数据点是否支持事件上送。
