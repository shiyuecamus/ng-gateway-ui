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

::: tip 实践建议用一个“值固定且可验证”的寄存器先校准（比如序列号/型号/固件版本），确认 address 体系无误后再批量建点。:::

### 2) 4xxxx / 3xxxx / 1xxxx / 0xxxx 的换算

很多资料会用下列“逻辑分区”表达：

- **4xxxx**：Holding Registers (0x03) -> `address = 逻辑值 - 40001`
- **3xxxx**：Input Registers (0x04) -> `address = 逻辑值 - 30001`
- **1xxxx**：Discrete Inputs (0x02) -> `address = 逻辑值 - 10001`
- **0xxxx**：Coils (0x01) -> `address = 逻辑值 - 00001`

> 这只是“人类可读分区”，并非协议层字段。驱动里分区由 `functionCode` 决定，`address` 只填偏移。

## Quantity（数量）

`address`、`quantity` 必须显式配置为无符号整数。缺少 quantity、quantity=0、小数以及 `address + quantity > 65536` 均在 I/O 前拒绝。

线圈/离散输入点位是单个 Boolean bit，`quantity=1`。寄存器单位为完整的 16-bit word；wire 类型决定标量的精确宽度：

| wire `dataType`                   |   精确寄存器数量 |
| --------------------------------- | ---------------: |
| Boolean、Int16、UInt16            |                1 |
| Int32、UInt32、Float32            |                2 |
| Int64、UInt64、Float64、Timestamp |                4 |
| String、Binary                    | 显式完整字段长度 |

Timestamp 为有符号 64 位毫秒时间戳。UInt8/Int8 的 wire 字节槽及 Int128 wire 字段未准入；需要逻辑类型转换时，显式选择 16/32/64 位 wire 类型与 `transformDataType`。宽度不符不会截取前缀或自动提升。

String 在去除末尾零填充后严格按 UTF-8 解码；Binary 保留全部字节。变长字段可以跨多个读取 PDU，完整组装后才应用整个字段的 word order。单 PDU 最多 125 个寄存器或 2000 个 bit；完整原始字段可更大，但必须满足地址和内存预算。

## 写入

可写保持寄存器点位在一个 word 时使用 06H，多个 word 时使用 10H；可写线圈点位使用 05H。输入寄存器和离散输入只读。Action 显式选择 05H/06H/0FH/10H：单写 quantity 必须为1，多线圈写最多1968 bit，多寄存器写最多123 word。Boolean action 值作用于声明范围内的每个线圈。

String/Binary 写入先对整个字段补零，再应用 word order；超长值直接拒绝。回包必须完整回显原始地址、值或 quantity。确认回包表示服务接受，不推断现场执行完成。
