---
title: 'Modbus 地址与 quantity 计算'
description: 'Modbus address 的 0/1 基、40001/30001 逻辑地址换算，以及不同 DataType 下 quantity 的正确计算方式。'
---

## Address (地址)

在 NG Gateway Modbus 驱动里，`address` 表示 **Modbus PDU 的 0 基起始地址**（0..65535）。这和很多手册的“逻辑地址”经常不是同一套体系。

### 1) 0 基 vs 1 基

如果设备手册写：
- “保持寄存器 40001 表示第 1 个寄存器”

那么 Modbus PDU 里通常要填：
- `address = 0` (因为 40001 是逻辑映射，偏移量为 0)

如果手册写：
- “寄存器地址从 0 开始”

那就直接按手册填。

::: tip 实践建议
用一个“值固定且可验证”的寄存器先校准（比如序列号/型号/固件版本），确认 address 体系无误后再批量建点。
:::

### 2) 4xxxx / 3xxxx / 1xxxx / 0xxxx 的换算

很多资料会用下列“逻辑分区”表达：

- **4xxxx**：Holding Registers (0x03) -> `address = 逻辑值 - 40001`
- **3xxxx**：Input Registers (0x04) -> `address = 逻辑值 - 30001`
- **1xxxx**：Discrete Inputs (0x02) -> `address = 逻辑值 - 10001`
- **0xxxx**：Coils (0x01) -> `address = 逻辑值 - 00001`

> 这只是“人类可读分区”，并非协议层字段。驱动里分区由 `functionCode` 决定，`address` 只填偏移。

## Quantity (数量)

`quantity` 决定了驱动读取多少个基本单位的数据。

### 1) 读线圈/离散输入 (0x01/0x02)

`quantity` 单位是 **bit（线圈数量）**。
- 单个 bool：`quantity = 1`

### 2) 读寄存器 (0x03/0x04)

`quantity` 单位是 **word（16-bit 寄存器数）**。

推荐按 `data_type` 计算，但也支持 **Smart Cast**（读少转多或读多转少）：

| DataType | 标准 quantity (word) | 兼容性处理 |
| --- | ---: | --- |
| **Int16 / UInt16** | 1 | - |
| **Int32 / UInt32** | 2 | 若 quantity=1，自动读取 16 位并提升为 32 位 |
| **Float32** | 2 | 若 quantity=1，自动读取 16 位整数并转为浮点 |
| **Float64** | 4 | 若 quantity=2，自动读取 32 位浮点并转为双精度 |
| **Int64 / UInt64** | 4 | 若 quantity=2，自动读取 32 位整数并提升为 64 位 |
| **Timestamp** | **2 或 4** | **2 words**: 视作秒级 (u32 * 1000)<br>**4 words**: 视作毫秒级 (i64) |
| **String / Binary** | N | 必须指定足够覆盖数据的长度 |

::: warning 
String/Binary 的 length 不是“字符数”的通用概念 `String/Binary` 的 `quantity` 本质是“读多少个寄存器（word）”，至于这段寄存器里如何编码字符串（UTF-8/ASCII/UTF-16、是否 `\\0` 结束、是否 0 填充、字节序/字序），取决于设备/上位机约定。

为了保证短字符串（如 `"a"` / `"shiyue"`）也能稳定读到“干净”的值，强烈建议设备侧采用**定长块全量覆盖 + `0x00` 填充**；否则可能读到包含 `\\0` 的中间脏数据。详见 [Modbus](./index.md) 文档中 `String` 的 warning。
:::

### 3) 写寄存器/线圈 (0x05/0x06/0x0F/0x10)

Action/WritePoint 写入同样使用 `address + quantity`。

**自动推断机制**：
对于北向单点写入（`write_point`），驱动会根据 `quantity` 自动选择功能码：
- 如果定义是 `ReadHoldingRegisters` (0x03)：
  - `quantity=1` -> 自动转为 `WriteSingleRegister` (0x06)
  - `quantity>1` -> 自动转为 `WriteMultipleRegisters` (0x10)

- 如果定义是 `ReadCoils` (0x01)：
  - `quantity=1` -> 自动转为 `WriteSingleCoil` (0x05)
  - `quantity>1` -> 自动转为 `WriteMultipleCoils` (0x0F)

这大大简化了配置，通常你只需要配置读属性，写入会自动适配。
