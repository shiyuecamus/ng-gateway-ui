---
title: 'Ethernet-IP'
description: 'NG Gateway Ethernet/IP 南向驱动：连接/slot/timeout 配置、Tag 建模、数据类型映射与限制（数组/结构体）。'
---

## 1. 协议介绍与常见场景

EtherNet/IP (Industrial Protocol) 是一种工业自动化网络协议，由 ODVA (Open DeviceNet Vendor Association) 组织开发和维护，可以帮助实现设备间的自动化控制和数据交换，如制造业、能源行业、交通物流、建筑等行业。

NG Gateway Ethernet/IP 驱动以客户端方式连接 PLC，并以 Tag 名称进行读写。

## 2. 配置模型

### 2.1 Channel（通道）配置

- **`host`**：PLC 地址（IPv4/hostname）
- **`port`**：默认 44818
- **`timeout`**：请求超时（ms，默认 2000）
- **`slot`**：槽号（默认 0）

::: tip
slot 的语义取决于 PLC 型号/机架结构；若不确定，保持默认并用一个已知 Tag 验证读写。
:::

### 2.2 Device（设备）配置

驱动层 device 配置为空（device 用于逻辑分组）。

### 2.3 Point（点位）配置

- **`tagName`**：Tag 名称（必填），例如：
  - `MyTag`
  - `Program:Main.MyTag`

### 2.4 Action（动作）配置

Action 用于封装一组“写入 Tag”的操作；**Action 本身不承载协议细节配置**。

- **关键语义**：Ethernet/IP 的写入目标 Tag 必须配置在 **Action 的 `inputs(Parameter)` 上**，即每个参数都通过 `Parameter.driver_config.tagName` 指定要写入的 Tag。
- **为什么这样设计**：一个 Action 往往需要写多个 Tag（例如一次下发多个设定值），Action 只是“操作集合”的抽象；真正可配置的协议字段必须落在 Parameter 本体上。

参数级驱动配置字段（每个 input parameter）：

- **`tagName`**：Tag 名称（必填），例如 `Program:Main.MyTag`


## 3. 值类型转换

- **读（uplink）**：PLC 返回的 `PlcValue` 会按 Point 声明的 `data_type` 与 `scale` 做 coercion（带范围检查/字符串解析）。
- **写（downlink）**：输入的 `NGValue` 会按 Point/Parameter 声明的 `data_type` 做 cast（带范围检查/字符串解析），再编码成要写入 PLC 的 `PlcValue`。

::: tip 解释
网关侧会尽力按 `data_type` 做转换，但 **PLC 侧仍会对 Tag 的真实 CIP 类型做检查**。因此 `data_type` 选错时，写入仍可能失败（类型不匹配/越界/截断等）。
:::

### 3.1 标量类型推荐映射表

这张表给出“最少踩坑”的建模选择：**让 `data_type` 与 PLC Tag 的真实类型一致**（读写都最稳）。

| PLC Tag 类型（CIP） | 推荐 DataType | 说明 |
| --- | --- | --- |
| BOOL | Boolean | - |
| SINT | Int8 | - |
| INT | Int16 | - |
| DINT | Int32 | - |
| LINT | Int64 | - |
| USINT | UInt8 | - |
| UINT | UInt16 | - |
| UDINT | UInt32 | - |
| ULINT | UInt64 | - |
| REAL | Float32 | - |
| LREAL | Float64 | - |
| STRING | String | - |
| LINT（Unix epoch ms） | Timestamp | **语义约定**：i64 毫秒时间戳；写入会编码为 `LINT` |

::: tip
复杂类型（数组/UDT/结构体）支持现状与替代建模策略见 [Tag建模](./tag.md)。
:::

### 3.2 Uplink转换规则

::: tip 核心语义
- **按 `data_type` coercion（带范围检查）**：例如 PLC 返回 `UDINT=42`，点位声明 `Int32`，则会上报 `NGValue::Int32(42)`；如果超出范围（例如 `UDINT > i32::MAX`）会报错并跳过该点位。
- **按 `scale` 缩放（仅读路径）**：仅对数值转换生效，语义为 `value * scale`。例如 PLC `INT=10`，点位 `data_type=Float64`，`scale=0.1`，则上报为 `1.0`。
  - 提醒：`Timestamp` 也是数值（i64 ms）。除非你非常确定，否则**不要**给时间戳配置 `scale`，否则会把时间戳本身缩放导致语义错误。
- **当 PLC 返回 `STRING` 时的特殊规则**：
  - `data_type=String`：原样上报字符串
  - `data_type=Boolean`：按 SDK 规则解析（`true/false/1/0/on/off/yes/no/y/n/t/f`，忽略大小写与首尾空白）
  - `data_type=Timestamp`：优先解析 RFC3339；否则把字符串当作“数字型时间戳”解析为 epoch ms（带范围检查）
  - 其它数值类型：先 `parse f64`，再按 `data_type` 强制转换并应用 `scale`
:::

### 3.3 Downlink转换规则

::: tip 核心语义
- **按 `data_type` cast + range check**：例如参数声明 `Int32`，输入是 `"123"`（String），会尝试解析并写入 `DINT(123)`。
- **不会自动应用 `scale`**：`scale` 是点位上行（读）语义；写入时请直接写 PLC 期望的“真实值”。
- **转换失败会返回 ValidationError**：例如越界、NaN/Inf、无法解析字符串等。
- **Boolean 的兼容输入**（写入 `data_type=Boolean` 时）：
  - `true/false`
  - 数值（0=false，非 0=true）
  - 字符串（同 uplink 的 token 规则）
:::

### 3.4 DataType 选择建议

- **第一优先级：对齐 PLC Tag 的真实类型**：这是“读写都稳定”的唯一方案。网关的 cast/coercion 是容错能力，不是让你随意混用类型。
- **Point（读）可以做 coercion，但要承担后果**：
  - 例如 PLC `UDINT` + `data_type=Int32`：只要数值在范围内就能上报；超范围会报错跳点
  - 例如 PLC `REAL` + `data_type=Int32`：会先按浮点取整再转整数，可能丢失小数
- **Action Parameter（写）必须更谨慎**：
  - 即使网关能把 `"123"` cast 成 `DINT(123)`，如果 PLC Tag 是 `REAL` 或 `STRING`，PLC 仍可能因 CIP 类型不匹配而拒绝写入
  - 结论：**写入的 `data_type` 更应该严格对齐 PLC Tag 类型**
- **Binary 支持现状（重要）**：
  - `Binary` 当前驱动不支持（现场最常见是 `SINT[]/BYTE[]` 数组，而当前底层 `PlcValue` 只支持标量与 UDT，不支持数组/字节串）
  - 替代建模策略见 [Tag建模](./tag.md)
- **Timestamp 最佳实践**：
  - `Timestamp` 的语义固定为 **i64 毫秒（epoch ms）**
  - 写入时会编码为 PLC `LINT`
  - 不建议用 `ULINT` 承载时间戳：超过 `i64::MAX` 会被判定为非法时间戳并转换失败

::: tip 最佳实践
- 如果你的 PLC 里是 UDT/结构体/数组：建议在 PLC 侧提供“标量镜像 Tag”（把成员拆成独立 Tag），或在 PLC/OPC Server 侧提供映射节点；当前版本驱动对复杂类型会报错。
- 先用一个“简单标量 Tag”（例如 `DINT` 计数器）验证读写通路与 `slot` 语义，再批量建模。
:::

### 3.5 常见失败模式与排障

- **Unsupported PlcValue type ...**
  - **含义**：PLC 返回了复杂类型（例如 UDT/结构体/数组），当前驱动无法映射为 `NGValue`。
  - **处理**：按 [Tag建模](./tag.md) 的建议在 PLC/Server 侧提供标量镜像 Tag，再在网关侧建模。
- **typed conversion failed ...**
  - **含义**：读路径按 `data_type/scale` 转换失败（常见原因：越界、字符串无法解析为数字/布尔、Timestamp 越界）。
  - **处理**：检查 Point 的 `data_type` 是否与 PLC Tag 对齐；检查 `scale` 是否合理（尤其避免给 `Timestamp` 配 `scale`）。
- **write value cast failed ... / ValidationError**
  - **含义**：写入前的 cast 失败（越界、NaN/Inf、字符串无法解析等）。
  - **处理**：检查 Parameter/Point 的 `data_type` 与输入 value；必要时先用数值类型输入而不是字符串。
- **PLC 侧写入失败（CIP type mismatch 等）**
  - **含义**：网关侧转换成功，但 PLC 拒绝（Tag 类型不匹配、权限/运行模式限制、越界等）。
  - **处理**：优先让写入 `data_type` 严格等于 PLC Tag 类型；并在PLC 工具侧核对 Tag 类型与写入权限/状态。
