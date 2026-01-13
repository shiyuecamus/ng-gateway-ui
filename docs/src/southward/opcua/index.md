---
title: 'OPC UA'
description: 'NG Gateway OPC UA 南向驱动使用与配置：连接/认证/安全策略、订阅 vs 周期读、NodeId 建模、数据类型映射与最佳实践。'
---

## 1. 协议介绍

OPC UA（OPC Unified Architecture）是面向工业自动化的机器到机器通信协议，由 OPC Foundation 维护。它提供统一的信息模型、可扩展的数据类型系统与内建安全机制（证书、加密、签名）。

## 2. 配置模型

### 2.1 Channel（通道）配置

Channel 是 OPC UA 会话边界：一个 Channel 对应一个 OPC UA Server（或一个 endpoint）。

#### 2.1.1 应用身份

- **`applicationName`**：客户端应用名（必填）
- **`applicationUri`**：客户端应用 URI（必填）

这些字段会参与 UA 的应用描述与证书/信任链体系（尤其是证书认证模式）。

#### 2.1.2 `url`（Endpoint URL）

::: tip 示例
- `opc.tcp://192.168.1.10:4840`
- `opc.tcp://server-hostname:4840`
:::

#### 2.1.3 `auth.kind`（认证方式）

- **anonymous**：匿名（最常用）
- **userPassword**：用户名密码
- **issuedToken**：颁发令牌（token 字符串）
- **certificate**：证书方式（`privateKey` + `certificate`）

::: warning 注意
证书内容通常以 PEM 字符串存储。
:::

#### 2.1.4 安全策略与安全模式

- **`securityPolicy`**：如 None / Basic256Sha256 / Aes256Sha256RsaPss ...
- **`securityMode`**：None / Sign / SignAndEncrypt

::: tip 最佳实践
- 生产环境建议至少 `Sign`，优先 `SignAndEncrypt`。
- 如果 Server 只开放某些 policy/mode 组合，请按 Server 的 endpoint 配置对齐。
:::

#### 2.1.5 采集模式：`readMode`

- **Subscribe（订阅）**：驱动创建 Subscription + MonitoredItems，Server 推送变化（推荐）
- **Read（周期采集）**：按采集周期主动 Read（适合少量点或 Server 不支持订阅/限制订阅）

::: warning 注意
Subscribe 模式更“事件驱动”，对高频变化点位更高效，但要关注 subscription 的批量与保活参数。
:::

#### 2.1.6 会话与保活参数

- **`sessionTimeout`**：会话超时（ms，默认 30000）
- **`keepAliveInterval`**：保活间隔（ms，默认 30000）
- **`maxFailedKeepAliveCount`**：最大失败保活次数（默认 3）
- **`subscribeBatchSize`**：订阅批量大小（默认 256）

::: tip 调参建议
- 点位很多时，适当增大 `subscribeBatchSize` 能减少 create/modify 请求次数，但过大可能触发服务端限制。
- `keepAliveInterval` 不要太小（会增加 Server 压力），也不要太大（故障检测慢）；默认值通常是合理起点。
:::

### 2.2 Device（设备）配置

OPC UA 驱动的 device 驱动配置为空。

::: tip 建模建议
- 你可以把“一个生产线/一个工段/一个子系统”建模为一个 Device，用于组织点位与北向主题路由。
:::

### 2.3 Point（点位）配置

- **`nodeId`**：OPC UA NodeId 字符串

### 2.4 Action（动作）配置

Action 用于封装一组“写入节点”的操作；**Action 本身不承载协议细节配置**。

- **关键语义**：OPC UA 的写入目标 NodeId 应配置在 **Action 的 `inputs(Parameter)` 上**，即每个参数都通过 `Parameter.driver_config.nodeId` 指定要写入的 NodeId。

参数级驱动配置字段（每个 input parameter）：

- **`nodeId`**：OPC UA NodeId 字符串

::: tip
NodeId 的格式与选取方式见，见 [NodeId语法](./nodeid.md)。
:::

## 3. 数据类型映射表

### 3.0 推荐映射表

| UA Variant（标量） | 推荐 DataType | 说明 |
| --- | --- | --- |
| Boolean | Boolean | - |
| SByte/Byte | Int8/UInt8 | - |
| Int16/UInt16 | Int16/UInt16 | - |
| Int32/UInt32 | Int32/UInt32 | - |
| Int64/UInt64 | Int64/UInt64 | - |
| Float/Double | Float32/Float64 | - |
| String | String | 也可映射为 Timestamp（RFC3339）或 Binary（hex string） |
| ByteString | Binary | - |
| DateTime | Timestamp | `Timestamp` 语义为 **i64 毫秒** |

### 3.1 读路径

- 数值型 Variant（`SByte/Int16/Int32/Int64/Float/Double 等`）：
  - 先转为 f64 再按 `DataType` 与 `scale` 做强制转换
- `Variant::Boolean`：按 `DataType` 与 `scale` 转换（推荐 `Boolean`）
- `Variant::String`：
  - `DataType::String`：直接输出字符串
  - `DataType::Timestamp`：尝试解析 RFC3339
  - `DataType::Binary`：尝试解析 hex 字符串
- `Variant::ByteString`：推荐映射为 `Binary`
- `Variant::DateTime`：推荐映射为 `Timestamp` 或 `String`
- `Variant::Array`：当前版本不支持，会返回空（点位不会产生值）

::: tip 重要
如果你需要数组/结构体，建议在 Server 侧提供标量节点，或在边缘侧扩展“结构体/数组”到 JSON 的映射能力。
:::

### 3.2 写路径

写入时按 Point 的 `data_type` 做强制转换并生成 Variant；`Timestamp` 会转换为 UA `DateTime`（如果时间戳非法则写入失败）。

:::: tip 最佳实践
- **尽量让 Point/Parameter 的 `data_type` 与 Server 节点的真实类型一致**，避免隐式转换导致的精度/范围问题。
- 如果 Server 节点是数组/结构体：建议在 Server 侧提供标量节点，或在边缘侧扩展“结构体/数组 → JSON”的能力；当前版本不会输出数组值。
::::
