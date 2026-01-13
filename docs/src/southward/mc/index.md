---
title: '三菱 MC'
description: 'NG Gateway Mitsubishi MC 协议南向驱动：PLC 系列、批量读写/帧大小/并发调优、MC 地址语法与数据类型映射。'
---

## 1. 协议介绍与常见场景

三菱 PLC 的 MC 协议（MELSEC Communication Protocol）常用于对三菱 PLC（A/QnA/Q/L/iQ-R 等）进行寄存器/线圈（设备）读写。不同系列在帧格式与批量能力上存在差异。

NG Gateway MC 驱动作为客户端连接 PLC，通过 MC 地址（如 `D100`、`X1A0`、`D20.2`）进行批量读写，并把结果映射为统一的 `NGValue`。

## 2. 配置模型：Channel / Device / Point / Action

### 2.1 Channel（通道）配置

MC 的 Channel 配置（可编辑字段）由 `@ng-gateway-southward/mc/src/metadata.rs` 定义，对应运行时结构 `McChannelConfig`：

- **`host`**：PLC IP/hostname
- **`port`**：端口（默认 5001，视现场 PLC/网关配置而定）
- **`series`**：PLC 系列（A / QnA / Q/L / iQ-R）
- **`maxPointsPerBatch`**：单批最大点数（用于批量读写规划）
- **`maxBytesPerFrame`**：单帧最大字节数（用于防止帧过大）
- **`concurrentRequests`**：并发请求数（默认 1，建议谨慎提高）

**为什么需要 series**：

- 不同系列对应不同的帧变体与批量上限（驱动内部会据此选择 frame variant 与限制）。

### 2.2 Device（设备）配置

驱动层 device 配置为空（device 用于逻辑分组）。

### 2.3 Point（点位）配置

Point 驱动配置字段：

- **`address`**：MC 地址（必填）
- **`stringLenBytes`**：字符串长度（字节，可选，仅当 `data_type=String` 需要固定长度时使用）

地址语法详见 `./addressing.md`。

### 2.4 Action（动作）配置

Action 用于封装一组“写入地址”的操作；**Action 本身不承载协议细节配置**。

- **关键语义**：MC 的写入目标地址应配置在 **Action 的 `inputs(Parameter)` 上**，即每个参数都通过 `Parameter.driver_config.address` 指定要写入的 MC 地址。
- **用法建议**：
  - 单地址写：建一个 Action，inputs 里放一个参数（一个 address）
  - 多地址批量写：同一个 Action 下定义多个参数（多个 address），一次 RPC 下发即可完成多点写入

参数级驱动配置字段（每个 input parameter）：

- **`address`**：MC 地址（必填）
- **`stringLenBytes`**：字符串长度（字节，可选，仅当 `data_type=String` 需要固定长度时使用）

## 3. 数据类型映射表（MC ↔ DataType）

值编解码逻辑位于 `@ng-gateway-southward/mc/src/codec.rs`（`McCodec`），批量规划与“字长”规则在 `mc/src/driver.rs::words_for_data_type`。

### 3.1 Point / Action Parameter 推荐映射（DataType → MC 字长/编码）

> MC 的“字（word）”是 16-bit。驱动会根据 `data_type` 计算需要读取/写入的 word 数量（String 需要额外提供长度）。

| DataType | word 数量 | 编码 | 说明 |
| --- | ---: | --- | --- |
| Boolean | 1 | 1 byte（0/1） | Bit 设备（X/Y/M 等）推荐只用 Boolean |
| Int8 / UInt8 | 1 | little-endian（低字节有效） | 作为 1 word 处理 |
| Int16 / UInt16 | 1 | little-endian | |
| Int32 / UInt32 / Float32 | 2 | little-endian | Float32 为 IEEE754 |
| Int64 / UInt64 / Float64 | 4 | little-endian | Float64 为 IEEE754 |
| String | ceil(stringLenBytes/2) | bytes | **必须**配置 `stringLenBytes`（Point 与 Action Parameter 同理） |
| Binary | - | - | 当前版本 **不支持**（Point/Action 都会报配置错误） |
| Timestamp | - | - | 当前版本 **不支持**（Point/Action 都会报配置错误） |

### 3.2 读路径（MC bytes → NGValue）

- 数值类型使用 **little-endian** 解码（符合 MC 二进制规范）
- `String`：读取固定长度 bytes；驱动不会自动 trim，建议在上层约定“0 结尾/填充规则”

### 3.3 写路径（NGValue → MC bytes）

写入同样按 little-endian 编码；建议 `data_type` 与目标设备的真实存储类型一致，否则会出现“写进去读不回来/值不对”。

::::
tip 最佳实践
- `String` 强烈建议明确 `stringLenBytes` 与 PLC 侧存储长度一致，并约定填充/截断规则。
- Bit 设备（X/Y/M 等）建议只使用 `Boolean`，避免“把 bit 当 word 写”带来的不可预期语义。
::::

## 4. 进阶文档

- `MC 地址语法与十进制/十六进制规则`：见 `./addressing.md`
- `批量读写/帧大小/并发调参`：见 `./batching.md`


