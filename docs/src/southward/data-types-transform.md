---
title: '数据类型（Wire vs Logical ）与 Transform 配置'
description: '解释点位/参数的 wire data type（协议/内存布局语义）、logical data type（北向语义），以及 Transform 的完整上行/下行链路、配置方法、影响面与常见坑。'
---

# 数据类型（Wire vs Logical ）与 Transform 配置

本章是南向体系中**最容易被误解**、但对稳定性与正确性影响最大的部分之一。

当你在网关里配置一个 Point（点位）或 Action Parameter（动作参数）时，有两个“类型”概念必须区分清楚：

- **wire data type（协议/内存布局语义）**：协议帧/寄存器/变量在现场设备上的**真实编码方式**，决定 driver 如何从字节/寄存器中解析与如何写回。
- **logical data type（北向语义）**：网关对外输出（上行 NorthwardData）以及下行校验/写入（WritePoint/ExecuteAction）使用的**对外语义类型**。

并且现在引入了统一的 **`Transform`**（变换）链路，用于把 wire 值转换成 logical 值（上行），以及把 logical 值逆变换成 wire 值（下行）。

---

## 1. 术语与核心结论

### 1.1 wire data type 是什么

**wire data type** 等价于 Point/Parameter 的 `dataType`（或内部字段 `data_type`）。

- 对 Modbus 来说：它描述“寄存器/线圈在内存布局中的解码方式”，例如 `Int16`、`UInt16`、`Float32`、`Boolean` 等。
- 对 S7/MC/EtherNet/IP/OPC UA 来说：它描述 driver 在编码/写回时应使用的协议级类型（例如 OPC UA 写 Variant 时用到的目标类型）。

::: tip 一句话：
**wire data type 决定 driver 如何读/写字节**。
:::

### 1.2 logical data type 是什么

**logical data type** 是网关对外语义类型，计算方式：

- 如果配置了 `transformDataType`（内部为 `transform_data_type`），那么 `logical = transformDataType`
- 否则 `logical = wire`

::: tip 一句话：
**logical data type 决定北向看到的类型、以及下行写入时校验的类型**。
:::

### 1.3 Transform 是什么

`Transform` 是一个可组合的轻量规则（无分配、Copy），目前支持四个字段：

- `transformDataType?: DataType`：逻辑类型（可选）
- `transformScale?: number`：比例系数 \(s\)（可选）
- `transformOffset?: number`：偏移量 \(o\)（可选）
- `transformNegate: boolean`：是否取反（默认 false）

数学定义（对“数值型”）：

- **上行（wire → logical）**：先做仿射变换，再按需取反  
  - 仿射：`y = x * s + o`  
  - 若 `transformNegate=true`：`y = -y`
- **下行（logical → wire）**：先按需取反，再做逆变换  
  - 若 `transformNegate=true`：`y = -y`  
  - 逆变换：`x = (y - o) / s`

::: tip 一句话：
**Transform 只定义“如何把值域从 wire 变成 logical（以及逆向）”**，它不替代协议地址/寄存器/订阅等 driver 配置。
:::

---

## 2. Transform 在上行/下行链路中到底发生在哪里

这里用“事实链路”解释——你理解这一段，就不会把 scale/min/max/类型搞混。

### 2.1 上行（Uplink）：现场 → 网关 → 北向

上行的目标是：**把现场设备的协议值（wire）稳定输出成 NorthwardData 里的 NGValue（logical）**。

典型步骤如下：

1. **driver 解析协议负载得到 wire 值**
   - Modbus：从线圈/寄存器切片里按 byte/word order 解码
   - S7/MC：按地址类型/transport size 解码
   - OPC UA：从 DataValue/Variant 读出值
   - EtherNet/IP：从 tag 读返回的 PLC 类型值解码
2. **driver 把 wire 值转成 logical 值**
   - 推荐使用 SDK 的统一入口：`ValueCodec::wire_to_logical_value(wire_value, wire_dt, logical_dt, transform)`
   - 或 driver 自己做等价的“coerce + transform”逻辑（各驱动内部 codec 可能封装了）
3. **driver 输出 NorthwardData（按业务 device 组织）**
   - 注意：即使采集时做了 group collection（见下一章），也必须按业务 device 输出

#### 上行的关键规则（非常重要）

- **logical_data_type 决定最终输出 NGValue 的类型**。  
  例如 wire 是 `Int16`，logical 配成 `Float64`，最终上行值会是 `NGValue::Float64`。
- **Transform 的 scale/offset/negate 在上行会真正影响值**。  
  例如 wire=100，scale=0.1 → logical=10.0

### 2.2 下行（Downlink）：北向 → 网关 → 现场

下行有两条入口：

- **WritePoint**：写点位
- **ExecuteAction**：执行动作（动作参数）

下行的目标是：**让北向只需要关心 logical 语义，网关负责把它可靠地转换成 wire 语义并写回设备**。

典型步骤如下：

1. **core 先做“逻辑层校验”**
   - 校验 `accessMode` 是否允许写入（Write/ReadWrite）
   - 校验写入值的类型是否匹配 **logical data type**
   - 校验数值范围 `minValue/maxValue`（如果配置）
2. **core 把 logical 值转换成 wire 值**
   - 统一入口：`ValueCodec::logical_to_wire_value(value, logical_dt, wire_dt, transform)`
   - 这一步会执行 **Transform 的逆变换**（scale/offset/negate），并把结果装箱成 wire data type
3. **driver 按 wire data type 做协议编码并写回**

#### 下行的关键规则（非常重要）

- **北向发来的值永远被视为 logical 值**（不是 wire 值）。  
  这意味着：如果你配置了 `transformScale=0.1`（wire→logical），那么北向发 10.0，写到设备的 wire 将是 100（逆变换）。
- **范围校验（min/max）发生在 logical 值域**。  
  也就是说，`minValue/maxValue` 应该跟北向看到的“工程值”对齐，而不是寄存器原始值。

---

## 3. 你到底应该怎么配：字段、语义、以及“写得安全”

### 3.1 Point 上的字段

Point 的关键字段：

- **`dataType`**：wire data type（协议/内存布局语义）
- **`transformDataType`**：logical data type（可选；不填则 logical=wire）
- **`transformScale` / `transformOffset` / `transformNegate`**：对数值型生效的 Transform 参数

::: warning 重要：Point 的 `dataType` 不等于“北向输出类型”
如果你配置了 `transformDataType`，北向输出与下行校验会使用 `transformDataType`。
:::

### 3.2 Action Parameter 上的字段

Action 的每个输入参数（Parameter）也有同样的 Transform 语义：

- **`dataType`**：parameter 的 wire data type（driver 最终要写到协议里的类型）
- **`transformDataType`**：parameter 的 logical data type（北向/调试 API 输入校验的类型）
- **`transformScale` / `transformOffset` / `transformNegate`**：同 Point

---

## 4. 使用场景：什么情况下必须用 Transform

这一节给你“直接可复制”的配置心智模型。

### 4.1 典型场景 A：寄存器是“放大整数”，北向要工程值

**现场语义**：温度寄存器是 Int16，值为 \(T \times 10\)。  
**期望**：北向输出 Float64 的 ℃，下行写入也用 ℃。

配置建议：

- wire（`dataType`）：`Int16`
- logical（`transformDataType`）：`Float64`
- `transformScale = 0.1`
- `transformOffset = 0`
- `transformNegate = false`
- `unit = "℃"`
- `minValue/maxValue`：按“工程值”配置，例如 `[-40, 125]`

行为：

- 上行：wire=253 → logical=25.3
- 下行：logical=25.3 → wire=253（逆变换 + rounding）

### 4.2 典型场景 B：传感器零点偏移

**现场语义**：压力寄存器返回 kPa，但希望北向输出“表压 = 实测 - 101.3”。  

配置建议：

- wire：`Float32`（或设备实际编码）
- logical：`Float64`
- `transformScale = 1.0`
- `transformOffset = -101.3`

### 4.3 典型场景 C：方向相反（需要 negate）

例如某些编码器/阀门开度方向相反：

- `transformNegate = true`

::: warning
`transformNegate` 的应用顺序是固定的：  
上行：先 scale/offset，再 negate；下行：先 negate，再逆 scale/offset。
:::

---

## 5. 重要限制与常见坑（避免踩雷）

### 5.1 非数值类型（String/Binary/Boolean/Timestamp）不是“随便能映射”

SDK 的策略是“可预测 + 不 silent corruption”：

- **下行（logical→wire）**：
  - 只要 logical 或 wire 有一方是“非数值类型”，就只允许 **wire==logical 且 Transform 为数值 identity**。
  - 换句话说：**Boolean/String/Binary/Timestamp 不支持通过 Transform 做类型映射后再写回**。
- **上行（wire→logical）**：
  - 对 logical 是“数值类型”的情况，会允许一些“数值-like wire 编码”（例如 String 里是 `"123.4"` 或 `"0x10"`）被解析成数值再做 Transform。
  - 但这只建议用于兼容，生产建议尽量让 wire 与协议真实编码保持一致，避免依赖宽松解析的容错。

::: warning 典型坑：Modbus 线圈（Boolean wire）想让北向当 Int32 写回
上行你可以把 logical 配成数值（true→1），但**下行写回会失败**，因为 Boolean wire 不支持 logical↔wire 的 Transform 映射。

如果需要写回：请保持 logical=Boolean，并在北向业务侧做映射。
:::

### 5.2 逆变换要求：`transformScale` 不能为 0

下行需要做 \(x=(y-o)/s\)，因此：

- `transformScale = 0` 会导致写回失败（配置错误）

### 5.3 大整数安全：超过 2^53 的 Int64/UInt64 会被拒绝做数值 Transform

当 Transform 非 identity 时，上/下行转换需要 `f64` 中间值。为了避免精度丢失导致“写错值/算错值”，SDK 会拒绝这种场景：

- `UInt64 > 2^53` 或 `Int64` 的绝对值 `> 2^53` + Transform 非 identity → 转换失败

建议：

- 对超大计数器（例如脉冲累计）尽量保持 identity Transform，或选择不会走 f64 的表达方式。

### 5.4 rounding 行为：写回整数时会 round

下行逆变换后写回整数类型时，会对 `f64` 做 `round()` 再转整型。

这意味着：

- 25.3 经 inverse 得到 253.0 → OK
- 25.35 经 inverse 得到 253.5 → 会 round（结果取决于 IEEE-754 的 round 语义）

生产建议：

- 如果现场要求“截断/向下取整”等特定策略，当前 Transform 不提供；请在北向侧或驱动侧明确实现，而不是“猜测 rounding”。

### 5.5 `minValue/maxValue` 的值域必须与 logical 对齐

core 的范围校验发生在 logical 值域，因此：

- 如果你对外暴露工程值（logical），那 `min/max` 也必须按工程值配置
- 不要把寄存器原始值（wire）范围写到 `min/max`，否则会出现“明明写入合理却被 OutOfRange 拒绝”或反之
