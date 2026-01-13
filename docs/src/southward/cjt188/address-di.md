---
title: 'CJT188 地址 / 类型 / DI / field_key'
description: 'CJ/T 188 设备地址的 14 位 hex 结构、表具类型与表具族（meter family），以及 DI / field_key/scale 的填写与解码语义（对齐当前实现）。'
---

## 1) 设备地址

驱动将“表类型(T)”与“地址域(A0..A6)”拆分为两个字段（与 CJ/T 188-2018 帧结构一致）：

- **`meterType`**：表类型（T，1 字节，0..=255）
- **`address`**：地址域（A0..A6，7 字节）

### `meterType`（T）

类型码用于区分水/热/燃气/自定义等。

**2018 仪表类型及代码 (CJ/T 188-2018):**

| 仪表类型范围 | 代码 (T) | 仪表说明 |
|-------------|----------|----------|
| 10H ~ 19H | 10H | 冷水水表 |
|  | 11H | 生活热水水表 |
|  | 12H | 直饮水水表 |
|  | 13H | 中水水表 |
| 20H ~ 29H | 20H | 热量表（计热量） |
|  | 21H | 热量表（计冷量） |
|  | 22H | 热量表（计热量和冷量） |
| 30H ~ 39H | 30H | 燃气表 |
| 40H ~ 49H | — | 自定义仪表 |

**2004 仪表类型及代码 (CJ/T 188-2004):**

| 仪表类型范围 | 代码 (T) | 仪表说明 |
|-------------|----------|----------|
| 10H ~ 19H | 10H | 冷水水表 |
|  | 11H | 生活热水水表 |
|  | 12H | 直饮水水表 |
|  | 13H | 中水水表 |
| 20H ~ 29H | 20H | 热量表（计热量） |
|  | 21H | 热量表（计冷量） |
| 30H ~ 39H | 30H | 燃气表 |
| 40H ~ 49H | 40H | 自定义仪表 |

### `address`

地址域由 **7 个字节**组成（A0..A6），每字节通常为 **2 位 BCD**。

- **驱动配置格式**：`address` 使用 **14 位 hex 字符串**，表示 **A6..A0 字节**（高位在前），例如：`00000000EE0001`

::: tip 备注
规约定义“低地址在前，高地址在后”是指 **在线路上的 A0..A6 字节顺序**；驱动会在协议编解码阶段自动完成 **A6..A0（配置）↔ A0..A6（线序）** 的转换。
:::

## 2) DI

驱动 UI 以 4 位 hex（2 字节）表达 DI（例如 `901F`）。

**DI 字节序差异**:
- **2018 版**: 小端（Little-Endian）。`901F` 发送为 `1F 90`。
- **2004 版**: 大端（Big-Endian）。`901F` 发送为 `90 1F`。

驱动会根据通道配置中的协议版本（Version）自动处理字节序。

实践建议：

- 以厂家手册/主站工具为准
- 如读不到值，优先确认：
  - 该 DI 在 2004/2018 版本下是否有效
  - 设备是否需要 SER/SEQ（2018）以及链路层参数是否一致

## 3) field_key 与 Schema 驱动解析

### 3.1 一个 DI ≠ 一个点位

CJ/T 188 的 **一个 DI（数据标识）通常代表一组字段**（例如 `901F` 同时包含“累积量/时间/状态”等）。本驱动采用 **DI Schema 驱动解析**：

- 驱动按 `Device.meterType` 归类为 **Water/Heat/Gas/Custom**（表具族）
- 再按 `(DI, 表具族)` 选择内置 schema
- 把该 DI 的响应解析为一组 `field_key -> NGValue`
- 每个 Point 通过 `field_key` 从 DI 数据组里“挑出”一个字段上报

因此：

- **同一个 DI 多字段采集**：建多个 Point，`di` 相同、`field_key` 不同
- **性能**：驱动会按 DI 分组读取；同一设备同一 DI 只发起一次请求，然后分发给多个 Point

### 3.2 field_key 必须来自内置 schema

`field_key` 不是任意字符串，它必须匹配驱动内置 schema 里的字段键：

- 如果 `field_key` 不存在或不属于该 DI/表具族：该点位会被跳过，并在日志中提示该点位未产出值（你需要按本文的 DI/field_key 列表修正）
- 如果 `(DI, meterType family)` 找不到 schema：该 DI 解析失败，并在日志里提示（你需要换 DI 或确认 `meterType`）

## 4) DI / field_key

### 4.1 Water / Gas

| DI（hex） | 含义（Schema 语义） | 可用 field_key（全部） |
| --- | --- | --- |
| `901F` | 水/燃气：综合读数（当前累积、结算日、时间、状态） | `current_flow`, `settlement_flow`, `datetime`, `status` |
| `D120..D12B` | 上 1..12 月：结算日累积流量 | `settlement_flow` |
| `D200..D2FF` | 上 1..256 月：结算日累积流量 | `settlement_flow` |
| `D300..D3FF` | 上 1..256 次：定时冻结数据 | `freeze_datetime`, `cumulative_flow`, `flow_rate`, `temperature`, `pressure` |
| `D400..D4FF` | 上 1..256 次：瞬时冻结数据 | `freeze_datetime`, `cumulative_flow`, `flow_rate`, `temperature`, `pressure` |

#### 字段解释（Water/Gas）

| field_key | 含义 | 推荐 DataType | 备注 |
| --- | --- | --- | --- |
| `current_flow` | 当前累积流量 | `Float64` | `BCDWithUnit(4 + unit)`，单位码不会上报；建议 Point.unit 写 `m³` |
| `settlement_flow` | 结算日/历史结算日累积流量 | `Float64` | `BCDWithUnit(4 + unit)` |
| `datetime` | 实时时间 | `Timestamp` | Unix epoch ms（UTC） |
| `status` | 状态位 | `UInt16` | 实际语义为 `u16` 小端；按位解析（见下文） |
| `freeze_datetime` | 冻结时刻（上 N 次） | `Timestamp` | 7 字节 DateTime → epoch ms（UTC） |
| `cumulative_flow` | 冻结时刻累积流量 | `Float64` | |
| `flow_rate` | 冻结时刻瞬时流量 | `Float64` | `BCDWithUnit(4 + unit)`，schema 内置 decimals=4 |
| `temperature` | 温度 | `Float64` | `BCD(decimals=2)` |
| `pressure` | 压力 | `Float64` | `BCD(decimals=2)` |

### 4.2 Heat

| DI（hex） | 含义（Schema 语义） | 可用 field_key（全部） |
| --- | --- | --- |
| `901F` | 热量表：综合读数（热量/功率/流量/温度/工时/时间/状态） | `settlement_heat`, `current_heat`, `heat_power`, `flow_rate`, `cumulative_flow`, `supply_temp`, `return_temp`, `working_hours`, `datetime`, `status` |
| `911F` | 热+冷：综合读数（含冷量、供回水压力） | `settlement_heat`, `settlement_cooling`, `current_heat`, `current_cooling`, `heat_power`, `flow_rate`, `cumulative_flow`, `supply_temp`, `return_temp`, `supply_pressure`, `return_pressure`, `working_hours`, `datetime`, `status` |
| `D120..D12B` | 上 1..12 月：结算日热量 | `settlement_heat` |
| `D200..D2FF` | 上 1..256 月：结算日热量/冷量/流量 | `settlement_heat`, `settlement_cooling`, `settlement_flow` |

#### 字段解释（Heat）

| field_key | 含义 | 推荐 DataType | 备注 |
| --- | --- | --- | --- |
| `settlement_heat` | 结算日热量 / 历史结算日热量 | `Float64` | `BCDWithUnit` |
| `current_heat` | 当前热量 | `Float64` | `BCDWithUnit` |
| `settlement_cooling` | 结算日冷量（仅 `911F`/`D200..D2FF`） | `Float64` | `BCDWithUnit` |
| `current_cooling` | 当前冷量（仅 `911F`） | `Float64` | `BCDWithUnit` |
| `heat_power` | 热功率 | `Float64` | `BCDWithUnit(3 + unit)` |
| `flow_rate` | 瞬时流量 | `Float64` | `BCDWithUnit(3 + unit)`（schema 内置 decimals=3/4） |
| `cumulative_flow` | 累积流量 | `Float64` | `BCDWithUnit` |
| `supply_temp` | 供水温度 | `Float64` | `BCD(decimals=2)` |
| `return_temp` | 回水温度 | `Float64` | `BCD(decimals=2)` |
| `supply_pressure` | 供水压力（仅 `911F`） | `Float64` | `BCD(decimals=2)` |
| `return_pressure` | 回水压力（仅 `911F`） | `Float64` | `BCD(decimals=2)` |
| `working_hours` | 累积工作时间 | `Int64` | `BCDInteger` |
| `datetime` | 实时时间 | `Timestamp` | Unix epoch ms（UTC） |
| `status` | 状态位 | `UInt16` | `u16` 小端 |
| `settlement_flow` | 历史结算日累积流量（仅 `D200..D2FF`） | `Float64` | `BCDWithUnit` |

### 4.3 Common（所有表具族通用）

| DI（hex） | 含义（Schema 语义） | 可用 field_key（全部） |
| --- | --- | --- |
| `907F` | 实时时间 | `datetime` |
| `8102` | 价格表（3 档） | `price_1`, `volume_1`, `price_2`, `volume_2`, `price_3` |
| `8103` | 结算日（day） | `settlement_day` |
| `8104` | 抄表日（day） | `reading_day` |
| `8105` | 购入金额（含状态） | `purchase_seq`, `this_purchase`, `total_purchase`, `remaining`, `status` |

## 5) 状态位（status）字段

`status` 字段在 schema 解析后语义上是 **`u16` 小端位图**。建议 Point 配置为 `data_type=UInt16`，便于下游按位解析。基础位定义见驱动代码注释：

- **D0**：阀门开关（0=开，1=关）
- **D1**：阀门状态（0=正常，1=异常）
- **D2**：电池电压（0=正常，1=欠压）
- **D3..D15**：厂商定义

建议做法：

- 把 `status` 建模为一个 Point（`field_key=status`）
- 在北向或规则引擎里按位解析（或二次映射为多个布尔属性）
