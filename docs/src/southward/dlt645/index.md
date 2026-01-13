---
title: 'DLT645'
description: 'NG Gateway DL/T 645 南向驱动使用与配置：645-1997/2007、串口/TCP、表地址/密码、DI、BCD 编解码与最佳实践。'
---

## 1. 协议介绍

DL/T 645 是国内电能表/多功能表常用规约，典型版本为 **DL/T 645-1997** 与 **DL/T 645-2007**（现场最常见）。协议常运行在 RS-485 上，也常通过串口服务器转换为 TCP。

NG Gateway DLT645 驱动的目标是：在一条总线上稳定轮询多个电表，并把 DI 对应的读数解码为统一的 `NGValue`。

## 2. 配置模型

### 2.1 Channel（通道）配置

一条 RS-485 总线（或一个 TCP 串口服务器连接）建模为一个 Channel。

#### 2.1.1 `version`（协议版本）

- `DL/T 645-1997`
- `DL/T 645-2007`

::: tip 版本会影响
- DI 长度（1997：2 字节；2007：4 字节）
- 控制码与部分语义
:::

#### 2.1.2 `connection.kind`（连接方式）

- **`Serial`**：串口/RS-485（推荐用于直连 485 总线）
- **`Tcp`**：TCP（串口服务器/网关）

Serial 参数（当 `connection.kind = Serial`）：

- **`connection.port`**：串口路径
- **`connection.baud_rate`**：波特率
- **`connection.data_bits`**：数据位（默认 8）
- **`connection.stop_bits`**：停止位（默认 1）
- **`connection.parity`**：校验位

TCP 参数（当 `connection.kind = Tcp`）：

- **`connection.host`**：主机
- **`connection.port`**：端口

#### 2.1.3 高级参数

- `maxTimeouts`：连续超时超过该值触发重连（默认 3）
- `wakeupPreamble`：发送前置唤醒码（默认 `[0xFE,0xFE,0xFE,0xFE]`）

::: tip 最佳实践
- RS-485 场景下，前置唤醒码是常见兼容策略；如现场设备明确不需要，可配置为空数组以减少带宽。
- 超时与重连：尽量不要把 `maxTimeouts` 设为 1（容易抖动重连），默认 3 通常更稳。
:::

### 2.2 Device（设备）配置

每个 Device 对应一块电表：

- `address`：电表地址（12 位数字，示例 `123456789012`）
- `password`：密码（默认 `00000000`，一般为 hex 字符串）
- `operatorCode`：操作员代码（可选）

::: tip
地址/DI 的详细解释见 [DL/T地址语法](./address-di.md)。
:::

### 2.3 Point（点位）配置

- `di`：数据标识（2007 通常为 8 位 hex；1997 会用低 16-bit）
- `decimals`：小数位（可选，用于 BCD 解码）

Point 的 `data_type` 会影响 BCD 解码后的强制类型转换与 `scale`。

### 2.4 Action（动作）配置

Action 用于封装一组“写表/控制/维护命令”的操作；**Action 本身不承载协议细节配置**。

- **关键语义**：DL/T 645 的控制码/DI/小数位等协议细节应配置在 **Action 的 `inputs(Parameter)` 上**，即每个参数都通过 `Parameter.driver_config` 指定该参数要执行的功能与编码细节。

参数级驱动配置字段（每个 input parameter）：

- **`functionCode`**：必填。功能码（Function Code）如下：

  | 枚举名称 | 说明 |
  | :--- | :--- |
  | `BroadcastTimeSync`| 广播校时 |
  | `ReadData` | 读数据 |
  | `ReadNextData` | 读后续数据 |
  | `ReadAddress` | 读通信地址 |
  | `WriteData` | 写数据 |
  | `WriteAddress` | 写通信地址 |
  | `Freeze` | 冻结命令 |
  | `UpdateBaudRate` | 更改通信速率 |
  | `ModifyPassword` | 修改密码 |
  | `ClearMaxDemand` | 最大需量清零 |
  | `ClearMeter` | 电表清零 |
  | `ClearEvents` | 事件清零 |
- **`di`**：可选。某些动作需要指定 DI（例如“写某个数据项”）；不需要 DI 的动作可省略。
- **`decimals`**：可选。数值型 BCD 编码/解码的小数位（默认策略见下表）。

## 3. 数据类型映射表

### 3.1 Point（上行）推荐映射

DL/T 645 大多数读数是 BCD（已去 0x33 偏移）：

- driver 会先 **BCD → f64**，再按 Point 的 `data_type` 强制转换，并应用 `scale`（如果配置）。
- `decimals` 控制 BCD 解码小数位（默认策略：数值型默认为 0 或 2，见下表）。

| DataType | 推荐场景 | 解码规则（实现语义） | 备注 |
| --- | --- | --- | --- |
| Float32 / Float64 | 绝大多数“读数/电量/功率/电压”等 | BCD → f64 → 浮点（应用 `scale`） | **最推荐**，最不易踩坑 |
| Int8/16/32/64 | 现场明确是有符号整数读数 | BCD → f64 → 整数（应用 `scale`） | 注意溢出与小数位 |
| UInt8/16/32/64 | 计数/序号/无符号读数 | BCD → f64 → 无符号整数（应用 `scale`） | 注意溢出 |
| Boolean | 状态位/开关量（实现为 bit0） | `payload[0] & 0x01 != 0` | 仅适合明确语义为 0/1 的数据项 |
| String | 表计返回可打印文本 | 尝试 UTF-8/ASCII；trim 末尾 0；失败fallback Binary | |
| Binary | 原始字节 | 原样 bytes | 当你不确定编码或需要上层解析时用它 |
| Timestamp | **谨慎使用** | 当前实现把 BCD 数值当作时间戳数值并做强制转换（i64 ms） | 如果设备返回的是“YYMMDDhhmmss”等格式，不建议用 Timestamp；请用 String/Binary 并在边缘侧转换 |

### 3.2 Action Parameter（下行）DataType 选择（写入编码）

DL/T 645 动作写入使用 `Dl645Codec::encode_parameter_value`，对 DataType 有明确白名单：

| Parameter.data_type | 是否支持 | 默认 decimals | 编码规则 |
| --- | --- | ---: | --- |
| Float32 / Float64 | ✅ | 2 | 数值 → BCD（有符号） |
| Int8/16/32/64 | ✅ | 0 | 数值 → BCD（有符号） |
| UInt8/16/32/64 | ✅ | 0 | 数值 → BCD（无符号） |
| Boolean | ✅ | - | 0x00 / 0x01 |
| String | ✅ | - | 原样 bytes（UTF-8/ASCII） |
| Binary / Timestamp | ❌ | - | driver 会返回配置错误 |

::: tip 最佳实践
- **写入值域要明确**：DL/T 645 的 Action 写入不会自动应用 `scale`（scale 是 Point 元数据）；你需要直接写入设备期望的值（并用 `decimals` 控制 BCD 小数位）。
- **能用 Float 就别硬塞整数**：读数类点位优先用 Float32/Float64，减少“整数溢出/截断/小数位”带来的问题。
:::
