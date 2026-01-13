---
title: 'IEC104 TypeID 与点位建模最佳实践'
description: '如何选择 Point 的 typeId/IOA，如何处理单点/双点/遥测/累计量，以及写命令（C_*）的值类型要求。'
---

## 1) 驱动如何把上送 ASDU 映射到点位

NG Gateway IEC104 驱动内部使用 `(typeId, ioa)` 作为 key 来匹配点位：

- `typeId`：点位配置里的 ASDU TypeID（u8）
- `ioa`：点位配置里的信息对象地址

因此：

- **同一个 IOA 在不同 TypeID 下是不同点位**
- 如果你把点位的 TypeID 配错，即使 IOA 正确，也不会匹配到数据

## 2) 常见上送类型（M_*）如何选 DataType

### 单点（M_SP_*）

语义：开关量/状态量（1 bit）  
推荐：

- `DataType = Boolean`

### 双点（M_DP_*）

语义：双点状态，通常取值 0..3（比如：中间态/开/关/不确定，具体按规约）  
推荐：

- `DataType = UInt8`（保留原始语义）
- 或在边缘计算层把 0..3 映射为业务枚举（更可读）

### 32bit 比特串（M_BO_*）

语义：32-bit 位串（如故障字、告警字）  
推荐：

- `DataType = UInt32`

### 遥测（M_ME_*）

IEC104 遥测有多种表达：

- 归一化（M_ME_NA/ND）
- 标度化（M_ME_NB）
- 短浮点（M_ME_NC）

推荐：

- 优先与现场 RTU/主站约定保持一致
- 对“工程值”遥测，推荐 `Float32/Float64`，并结合 `scale` 做单位换算

### 累计量（M_IT_*）

语义：电能/累计量计数  
推荐：

- `DataType = Int64` 或 `UInt64`

## 3) 写命令类型（C_*）的值类型要求

写入时（WritePoint / Action Parameter）驱动会按命令 TypeID 强制把输入值转换为目标类型：

- C_SC_*：bool
- C_DC_*：u8
- C_RC_*：u8
- C_SE_*（NA/NB）：i16
- C_SE_*（NC）：f32
- C_BO_*：i32

::: tip 最佳实践
Point/Parameter 的 `data_type` 与命令语义一致，这样 core 的类型校验和 driver 的转换会更可预测。
:::

## 4) CA（公共地址）如何建模

CA 被建模为 Device 配置：

- **一个 CA 一个 Device** 是最常见做法
- 同一 TCP 链路上多个 CA 时，建多个 Device 共享一个 Channel
