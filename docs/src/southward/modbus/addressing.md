---
title: 'Modbus 地址与 quantity 计算'
description: 'Modbus address 的 0/1 基、40001/30001 逻辑地址换算，以及不同 DataType 下 quantity 的正确计算方式。'
---

## addres

在 NG Gateway Modbus 驱动里，`address` 表示 **Modbus PDU 的 0 基起始地址**（0..65535）。这和很多手册的“逻辑地址”经常不是同一套体系。

### 1) 0 基 vs 1 基

如果设备手册写：

- “保持寄存器 40001 表示第 1 个寄存器”

那么 Modbus PDU 里通常要填：

- `address = 0`

如果手册写：

- “寄存器地址从 0 开始”

那就直接按手册填。

::: tip 实践建议
用一个“值固定且可验证”的寄存器先校准（比如序列号/型号/固件版本），确认 address 体系无误后再批量建点。
:::

### 2) 4xxxx / 3xxxx / 1xxxx / 0xxxx 的换算

很多资料会用下列“逻辑分区”表达：

- 4xxxx：Holding Registers（0x03）
- 3xxxx：Input Registers（0x04）
- 1xxxx：Discrete Inputs（0x02）
- 0xxxx：Coils（0x01）

> 这只是“人类可读分区”，并非协议层字段。驱动里分区由 `functionCode` 决定，`address` 只填偏移。

## quantity

### 1) 读线圈/离散输入（0x01/0x02）

`quantity` 单位是 **bit（线圈数量）**。

- 单个 bool：`quantity = 1`
- bitfield：不建议用单点承载（驱动侧会把 response bitset 拆分/映射成本地点位更清晰）；如果现场必须按位段取值，建议建多个点或在边缘计算层做组合。

### 2) 读寄存器（0x03/0x04）

`quantity` 单位是 **word（16-bit 寄存器数）**。

推荐按 `data_type` 计算：

| DataType | 建议 quantity（word） |
| --- | ---: |
| Int16 / UInt16 | 1 |
| Int32 / UInt32 / Float32 | 2 |
| Int64 / UInt64 / Float64 / Timestamp | 4 |
| Int8 / UInt8 / Boolean | 1（不推荐把寄存器当 bool，除非设备手册明确如此定义） |
| String / Binary | N（必须由手册定义长度或业务约定固定长度） |

### 3) 写寄存器/线圈（0x05/0x06/0x0F/0x10）

Action/WritePoint 写入同样使用 `address + quantity`：

- 写线圈：`quantity` 是 bit 数
- 写寄存器：`quantity` 是 word 数

当写入数据类型为 32/64-bit 时，务必保证：

- `quantity` 覆盖数据类型所需的 word 数
