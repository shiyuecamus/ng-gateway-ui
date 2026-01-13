---
title: 'DNP3 CROB：ControlCode(u8) 取值表'
description: 'NG Gateway DNP3 驱动 CROB(Control Relay Output Block) 下发时 value=u8 的位域语义、网关允许的取值范围（48 个）以及 WritePoint/Action 如何选择。'
---

当你通过 **WritePoint**（写点）或 **Action**（动作）下发 CROB 命令时，驱动要求：

- `data_type=UInt8`
- `value` 是一个 **u8 控制码**（DNP3 Group12Var1 ControlCode）

但是 **并不是所有 0..=255 的 u8 都被网关接受**：为避免歧义/误动作，网关仅支持一个明确的安全子集（见下文完整表格）。

## 1. 位域定义

驱动对 CROB `ControlCode` 的编码/解码遵循如下位域：

- **bits 7..6**：Trip/Close Code（TCC）
  - 0b00 → `Nul`
  - 0b01 → `Close`
  - 0b10 → `Trip`
  - 0b11 → `Reserved`（**网关拒绝**）
- **bit 5**：`clear`
- **bit 4**：`queue`（标准中已 obsolete，但仍可表示；设备是否支持取决于 Outstation）
- **bits 3..0**：OpType（操作类型）
  - 1 → `PulseOn`
  - 2 → `PulseOff`
  - 3 → `LatchOn`
  - 4 → `LatchOff`
  - 0/5..15（**网关拒绝**）

## 2. 最常用的 4 个值

如果你不需要 `Trip/Close`、也不需要 `queue/clear`（现场最常见），则：

- `PulseOn` → **1 (0x01)**
- `PulseOff` → **2 (0x02)**
- `LatchOn` → **3 (0x03)**
- `LatchOff` → **4 (0x04)**

## 3. 网关允许的完整 ControlCode(u8) 列表

| u8(dec) | u8(hex) | OpType | TCC | queue | clear |
| ---: | ---: | --- | --- | --- | --- |
| 1 | 0x01 | PulseOn | Nul | false | false |
| 2 | 0x02 | PulseOff | Nul | false | false |
| 3 | 0x03 | LatchOn | Nul | false | false |
| 4 | 0x04 | LatchOff | Nul | false | false |
| 17 | 0x11 | PulseOn | Nul | true | false |
| 18 | 0x12 | PulseOff | Nul | true | false |
| 19 | 0x13 | LatchOn | Nul | true | false |
| 20 | 0x14 | LatchOff | Nul | true | false |
| 33 | 0x21 | PulseOn | Nul | false | true |
| 34 | 0x22 | PulseOff | Nul | false | true |
| 35 | 0x23 | LatchOn | Nul | false | true |
| 36 | 0x24 | LatchOff | Nul | false | true |
| 49 | 0x31 | PulseOn | Nul | true | true |
| 50 | 0x32 | PulseOff | Nul | true | true |
| 51 | 0x33 | LatchOn | Nul | true | true |
| 52 | 0x34 | LatchOff | Nul | true | true |
| 65 | 0x41 | PulseOn | Close | false | false |
| 66 | 0x42 | PulseOff | Close | false | false |
| 67 | 0x43 | LatchOn | Close | false | false |
| 68 | 0x44 | LatchOff | Close | false | false |
| 81 | 0x51 | PulseOn | Close | true | false |
| 82 | 0x52 | PulseOff | Close | true | false |
| 83 | 0x53 | LatchOn | Close | true | false |
| 84 | 0x54 | LatchOff | Close | true | false |
| 97 | 0x61 | PulseOn | Close | false | true |
| 98 | 0x62 | PulseOff | Close | false | true |
| 99 | 0x63 | LatchOn | Close | false | true |
| 100 | 0x64 | LatchOff | Close | false | true |
| 113 | 0x71 | PulseOn | Close | true | true |
| 114 | 0x72 | PulseOff | Close | true | true |
| 115 | 0x73 | LatchOn | Close | true | true |
| 116 | 0x74 | LatchOff | Close | true | true |
| 129 | 0x81 | PulseOn | Trip | false | false |
| 130 | 0x82 | PulseOff | Trip | false | false |
| 131 | 0x83 | LatchOn | Trip | false | false |
| 132 | 0x84 | LatchOff | Trip | false | false |
| 145 | 0x91 | PulseOn | Trip | true | false |
| 146 | 0x92 | PulseOff | Trip | true | false |
| 147 | 0x93 | LatchOn | Trip | true | false |
| 148 | 0x94 | LatchOff | Trip | true | false |
| 161 | 0xA1 | PulseOn | Trip | false | true |
| 162 | 0xA2 | PulseOff | Trip | false | true |
| 163 | 0xA3 | LatchOn | Trip | false | true |
| 164 | 0xA4 | LatchOff | Trip | false | true |
| 177 | 0xB1 | PulseOn | Trip | true | true |
| 178 | 0xB2 | PulseOff | Trip | true | true |
| 179 | 0xB3 | LatchOn | Trip | true | true |
| 180 | 0xB4 | LatchOff | Trip | true | true |

## 4. WritePoint / Action 应该怎么用？

### 4.1 WritePoint（BinaryOutput 写点）

- `point.group=BinaryOutput`
- `point.data_type=UInt8`
- `value`：填写本页表格中的 `u8(dec)`

:::: warning 注意
WritePoint 路径 **无法** 控制 `crobCount/crobOnTimeMs/crobOffTimeMs`（驱动刻意不暴露这些协议级字段）。如果你需要配置次数/脉冲时序，请使用 **Action** 路径。
::::

### 4.2 Action（CROB 批量控制）

- `Action.inputs[].driver_config.group=CROB`
- `Action.inputs[].driver_config.index=<目标索引>`
- `Action.inputs[].data_type=UInt8`
- `Action.inputs[].value`：填写本页表格中的 `u8(dec)`
- `crobCount/crobOnTimeMs/crobOffTimeMs`：通过 **Parameter 级建模字段**配置

:::: warning 注意
如果你传入的 `value` 不在上表 48 个值里（比如 op_type=0 或 tcc=Reserved），驱动会直接拒绝并返回错误。
::::

