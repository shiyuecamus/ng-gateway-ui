---
title: 南向驱动开发
description: 以 Modbus 为 Demo，讲清楚如何在 NG Gateway 中从 0 到 1 开发一个可上线的生产级南向驱动：接口契约、配置/元数据、并发与背压、超时与重试、可观测性、测试与发布。
---

# 南向驱动开发

本章面向 **驱动开发者**，目标是让你能按步骤完成一个 **生产级** 的南向驱动（Southward Driver）：

- **能被网关动态加载**：以 `cdylib` 形式发布，满足 ABI/版本约束
- **能被 UI 自动建模**：通过 Driver Metadata Schema 自动渲染配置表单与 Excel 导入模板
- **能跑得稳/跑得快**：高吞吐、低延迟、弱网容错、可追踪、可排障

## 0. 前置条件与硬性约束

### 0.1 关键概念
在 NG Gateway 中，“南向驱动”不是一个单纯的协议解析库，而是一个 **被网关托管生命周期** 的组件：

- **网关侧 - Host** 负责：
  - 动态加载/探测驱动库
  - 统一日志桥接、动态日志级别、可观测性汇聚
  - 按配置创建 Channel/Device/Point/Action 的 runtime 视图，并驱动采集/写回
- **驱动侧 - Driver cdylib** 负责：
  - 实现“如何连接设备 + 如何采集 + 如何写回/执行动作”
  - 提供一份 **静态元数据 Schema**（UI和excel导入用），以及必要的 ABI 导出符号

### 0.2 你需要准备什么

- **Rust 开发环境**：安装最新 stable 工具链。
- **网关本地环境**：参考 [本地开发](/dev/local-dev) 搭建好后端与 WebUI，确保能运行。
- **协议模拟器**：准备好你要开发的协议模拟器（如 Modbus Slave / TCP Server），用于本地联调。

### 0.3 硬性约束

::: warning 必须遵守的契约
1. **`metadata_fn` 必须纯**：不得读文件、环境变量或网络。Probe 阶段必须可复现且零副作用。
2. **`Connector::new(ctx)` 必须同步且无 I/O**：所有网络/文件/阻塞 I/O 必须放在 `connect()` / `init()` / `run()` 中。
3. **热路径（`SouthwardHandle`）禁止阻塞**：`collect_data` / `write_point` 必须是异步非阻塞的，禁止长时间持锁或同步 I/O。
4. **严禁 `unwrap()` / `expect()`**：生产级代码必须处理所有错误，返回 `Result` 并携带上下文。
:::

## 1. 创建插件 crate

在开始编写代码前，先创建一个新的驱动 crate（建议以 `ng-driver-` 作为前缀）。

```bash
cargo new --lib ng-driver-yourproto
cd ng-driver-yourproto
```

### 1.1 Cargo.toml 最小约束

推荐在独立仓库创建驱动 crate，依赖 `ng-gateway-sdk`。

```toml
[package]
name = "ng-driver-yourproto"
version = "0.1.0"
edition = "2021"
publish = false

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
ng-gateway-sdk = "0.1"
tokio = { version = "1", features = ["full", "tracing"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
async-trait = "0.1"
tracing = "0.1"
thiserror = "2"
bytes = "1"
```

### 1.2 构建产物

```bash
cargo build --release
```
产物位于 `target/release/`，根据平台不同为 `*.so` (Linux), `*.dylib` (macOS), `*.dll` (Windows)。

## 2. 创建插件模块

### 2.1 推荐工程模块

建议采用以下目录结构，保持职责清晰：

```text
ng-driver-yourproto/
  Cargo.toml
  src/
    lib.rs         // 导出 factory
    metadata.rs    // UI Schema (纯静态)
    types.rs       // 运行时配置结构 (serde)
    converter.rs   // Model -> Runtime 转换
    connector.rs   // Connector 实现
    session.rs     // Session 实现
    handle.rs      // SouthwardHandle 实现 (热路径)
    codec.rs       // 协议编解码
    planner.rs     // (可选) 批量规划策略
    protocol/      // (可选) 复杂协议栈封装
      mod.rs
      frame.rs
      codec.rs
      client.rs
      session.rs
```

### 2.2 工程模块边界

- **导出层 (`lib.rs`)**：只做 `ng_driver_factory!` 宏调用。
- **配置层 (`metadata.rs`, `types.rs`)**：定义 UI 怎么展示，以及配置怎么反序列化。
- **协议层 (`codec.rs` 或 `protocol/`)**：处理字节流与协议帧的转换。简单协议直接写在 `codec.rs`；复杂协议（如 S7/IEC104）建议抽取 `protocol` 模块，包含帧定义、状态机等。
- **连接层 (`connector.rs`, `session.rs`)**：管理连接生命周期、重连、资源初始化。
- **热路径层 (`handle.rs`)**：负责高频的采集与控制指令执行。

## 3. 配置及 Schema

### 3.1 `config.rs/types.rs` - 运行时配置

定义强类型的配置结构，用于运行时逻辑。

:::details `config.rs`

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YourProtoChannelConfig {
    pub ip: String,
    pub port: u16,
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
}

fn default_timeout() -> u64 { 1000 }

// Device, Point, Action 配置同理...
```

:::

### 3.2 `metadata.rs` - UI/Excel Schema

定义 UI 表单结构，支持校验与国际化。

:::details `metadata.rs`

```rust
use ng_gateway_sdk::{
    ui_text, DriverSchemas, Field, Node, Rules, RuleValue, UiDataType,
};
use serde_json::json;

pub(super) fn build_metadata() -> DriverSchemas {
    DriverSchemas {
        channel: vec![
            Node::Field(Box::new(Field {
                path: "ip".into(),
                label: ui_text!(en = "IP Address", zh = "IP 地址"),
                data_type: UiDataType::String,
                rules: Some(Rules {
                    required: Some(RuleValue::Value(true)),
                    ..Default::default()
                }),
                ..Default::default()
            })),
            // ... port, timeout 等字段
        ],
        device: vec![], // 定义设备级配置
        point: vec![],  // 定义点位级配置
        action: vec![], // 定义动作级配置
    }
}
```

:::

::: warning Schema 设计要点

- **字段路径 (path)**：必须与 `config.rs`/`types.rs` 中的 serde 字段名一致。
- **校验前置**：利用 `Rules` (min, max, pattern, required) 在 UI 层拦截错误。
- **默认值**：为非必填项提供合理的 `default_value`。
- **国际化**：使用 `ui_text!` 宏提供中英文对照。

:::

## 4. 实现 Model Convert

::: tip `职责`
- 解析/归一化地址（例如 0/1 基换算、字符串 trim）
- 预编译表达式（例如映射/过滤/模板）
- 预计算寄存器 span、固定长度、字节序策略
- 预分配/缓存 Planner 的静态结构（例如按函数码分组的索引）

> 这样可以显著降低每次采集的 CPU 与分配开销
:::

::: details `converter.rs`

```rust
use ng_gateway_sdk::{
    supervision::converter::SouthwardModelConverter, ActionModel, ChannelModel, DeviceModel,
    DriverError, DriverResult, PointModel, RuntimeAction, RuntimeChannel, RuntimeDevice,
    RuntimePoint,
};
use std::sync::Arc;
use crate::types::{YourProtoChannel, YourProtoDevice, YourProtoPoint, YourProtoChannelConfig};

#[derive(Debug, Clone, Default)]
pub struct YourConverter;

impl SouthwardModelConverter for YourConverter {
    fn convert_runtime_channel(
        &self,
        channel: ChannelModel,
    ) -> DriverResult<Arc<dyn RuntimeChannel>> {
        // 1. 反序列化 driver_config 为强类型配置
        let config: YourProtoChannelConfig = serde_json::from_value(channel.driver_config.clone())
            .map_err(|e| DriverError::ConfigurationError(format!("Invalid channel config: {e}")))?;

        // 2. 构造 RuntimeChannel (通常是一个包含通用字段 + 强类型配置的结构)
        Ok(Arc::new(YourProtoChannel {
            id: channel.id,
            name: channel.name,
            // ... 复制其他通用字段 (status, collection_type 等)
            config, // 注入强类型配置
        }))
    }

    fn convert_runtime_device(&self, device: DeviceModel) -> DriverResult<Arc<dyn RuntimeDevice>> {
        // 解析设备级 driver_config
        let driver_config = device.driver_config.as_ref().ok_or(DriverError::ConfigurationError(
            "Driver config is required".to_string(),
        ))?;
        
        let slave_id = driver_config.get("slaveId")
            .and_then(|v| v.as_u64())
            .ok_or(DriverError::ConfigurationError("slaveId is required".into()))? as u8;

        Ok(Arc::new(YourProtoDevice {
            id: device.id,
            // ...
            slave_id,
        }))
    }

    fn convert_runtime_point(&self, point: PointModel) -> DriverResult<Arc<dyn RuntimePoint>> {
        // 解析点位级 driver_config，提取热路径需要的关键参数
        let address = point.driver_config.get("address")
            .and_then(|v| v.as_u64())
            .ok_or(DriverError::ConfigurationError("address is required".into()))? as u16;

        Ok(Arc::new(YourProtoPoint {
            id: point.id,
            // ...
            address,
        }))
    }

    fn convert_runtime_action(&self, _action: ActionModel) -> DriverResult<Arc<dyn RuntimeAction>> {
        // 如果支持动作，在这里解析 ActionModel
        Err(DriverError::NotImplemented("Action not supported".into()))
    }
}
```

:::

## 5. 实现 Connector / Session / Handle

### 5.1 Connector

#### 5.1.1 Connector 职责、生产级建议
::: tip `职责`
- 保存初始化上下文（配置、runtime 视图、observer、策略等）
- 实现 `connect(ctx)`：建立一个 `Session`
- 实现 `classify_error(phase, err)`：告诉 supervision loop 这个错误要不要重试
:::

::: warning 生产级建议
- 在 `classify_error` 里把常见错误做“可控分类”
  - **Retryable**：短暂网络波动、超时、连接被重置、串口临时不可用
  - **Fatal/Stop**：配置错误（非法地址/非法证书路径）、鉴权失败（明确不可恢复）
- 给 `error_summary/error_code` 提供稳定聚合维度，便于告警与排障
  - `error_summary`：面向人类阅读的短句（**不要**塞大对象/长堆栈）
  - `error_code`：稳定、低基数（例如 `tcp_connect_timeout` / `auth_failed` / `config_invalid` / `protocol_decode_error`）
- **不要**在这里做任何网络/阻塞 I/O（`Connector::new(ctx)` 明确禁止 I/O；`connect()` 才是建立会话的地方）
- 把“高频细节”留给 `tracing`，把“低频聚合维度”留给 `error_code/error_summary`
:::

::: details `connector.rs`

```rust
use ng_gateway_sdk::supervision::{Connector, Session, SessionContext, FailureKind, FailurePhase};
use ng_gateway_sdk::{DriverError, SouthwardInitContext};
use std::sync::Arc;
use crate::session::YourSession;
use crate::handle::YourHandle;
use crate::types::YourProtoChannelConfig;

pub struct YourConnector {
    config: YourProtoChannelConfig,
    handle: Arc<YourHandle>,
}

#[async_trait::async_trait]
impl Connector for YourConnector {
    type InitContext = SouthwardInitContext;
    type Handle = YourHandle;
    type Session = YourSession;

    fn new(ctx: Self::InitContext) -> Result<Self, DriverError> {
        let config = crate::converter::parse_channel_config(&ctx)?;
        let handle = Arc::new(YourHandle::new());
        Ok(Self { config, handle })
    }

    async fn connect(&self, ctx: SessionContext) -> Result<Self::Session, DriverError> {
        // 在这里做 I/O，建立连接
        let stream = tokio::net::TcpStream::connect((self.config.ip.as_str(), self.config.port))
            .await
            .map_err(|e| DriverError::SessionError(e.to_string()))?;
            
        Ok(YourSession::new(self.handle.clone(), stream))
    }

    fn classify_error(&self, _phase: FailurePhase, _err: &DriverError) -> FailureKind {
        // 简单分类，可根据 err 具体类型细化
        FailureKind::Retryable
    }
}
```

:::

### 5.2 Session

> `Session` 表示“一次 attempt（连接尝试）成功创建后的生命周期”

#### 5.2.1 Session 职责、生产级建议
::: tip `职责`
- `handle()`：返回 `Arc<Handle>`（热路径接口）
- `init(&ctx)`：完成“定义 Ready 的初始化”（例如读设备信息、订阅、写入初始状态）
- `run(ctx)`：驱动会话直到断开/取消/请求重连
:::

::: warning 生产级建议
- `init()` 里做“短平快”的握手校验（超时可控），不要把长循环塞进 `init()`
- `run()` 里使用 `tokio::select!` 同时处理：
  - cancel（优雅退出）
  - 心跳/保活
  - 上行/下行任务的 join
  - 监听内部“请求重连”信号：当协议层检测到不可恢复的 transport 异常/长时间超时，调用 `ctx.reconnect.try_request_reconnect(reason)` 触发监督循环重连（**不 await**）
:::

::: details `生命周期语义速查`

- `Connector::connect(ctx)`
  - **做什么**：建立 transport（TCP/UDP/Serial）并完成协议层 connect/握手，构造 `Session`
  - **必须**：尊重 `ctx.cancel`；设置可控超时；优先使用 SDK 的 metered transport（确保 `transport_meter` 计量完整）
  - **不要**：在这里 publish handle（Ready 由 `Session::init` 定义）；不要 spawn 无取消的后台任务

- `Session::init(&ctx)`
  - **做什么**：定义“Ready”边界，把 data-plane 运行所需依赖注入到 `handle()`（例如连接池、订阅管理器、reconnect handle）
  - **必须**：低成本、可控超时；失败要能用 `error_summary/error_code` 聚合定位（常见是鉴权/权限/协议不兼容）
  - **不要**：启动无限循环（应该放到 `run()`）；不要做不可控的全量扫描

- `Session::run(ctx)`
  - **做什么**：驱动会话直到断开/取消/请求重连，负责 attempt 级资源边界与清理
  - **返回值**：优先 `Disconnected` 或 `ReconnectRequested(reason)`；只有明确不可恢复时才用 `Fatal(FailureReport)`
  - **必须**：退出时释放连接/订阅/后台任务；确保 cancel 路径快速、幂等
:::


::: details `session.rs`

```rust
use ng_gateway_sdk::supervision::{Session, SessionContext, RunOutcome};
use ng_gateway_sdk::DriverError;
use std::sync::Arc;
use tokio::net::TcpStream;
use crate::handle::YourHandle;

pub struct YourSession {
    handle: Arc<YourHandle>,
    stream: Option<TcpStream>,
}

impl YourSession {
    pub fn new(handle: Arc<YourHandle>, stream: TcpStream) -> Self {
        Self { handle, stream: Some(stream) }
    }
}

#[async_trait::async_trait]
impl Session for YourSession {
    type Handle = YourHandle;
    type Error = DriverError;

    fn handle(&self) -> &Arc<Self::Handle> {
        &self.handle
    }

    async fn init(&mut self, ctx: &SessionContext) -> Result<(), Self::Error> {
        // 注入依赖到 Handle (例如 stream)
        if let Some(stream) = self.stream.take() {
            self.handle.attach_transport(stream, ctx.reconnect.clone());
        }
        Ok(())
    }

    async fn run(self, ctx: SessionContext) -> Result<RunOutcome, Self::Error> {
        // 等待取消信号
        ctx.cancel.cancelled().await;
        // 清理资源
        self.handle.detach_transport();
        Ok(RunOutcome::Disconnected)
    }
}
```

:::

### 5.3 Handle

#### 5.3.1 Handle 职责、生产级建议、热路径契约

::: tip `职责`
- **采集规划**：根据 `CollectItem` 制定最优的协议请求策略（例如合并相邻寄存器、分批请求），减少网络 I/O 次数。
- **协议交互**：获取连接，执行协议请求，并处理超时与重试。
- **数据映射**：将协议响应（bytes/words）解码为 `NGValue`，并封装为 `NorthwardData`。
- **动作/写点**：处理写请求，执行必要的编码转换，并返回执行结果。
- **分组策略**：(可选) 实现 `collection_group_key`，将同属一个物理连接的多个逻辑设备聚合采集。
:::

::: warning 生产级建议
- **不要在热路径里阻塞**：避免长时间持锁、避免大分配、避免同步 I/O；必要时把慢工作下沉到内部 actor/worker。
- **超时控制**：所有 I/O 操作必须有超时。
- **失败语义要清晰**：`ServiceUnavailable/Timeout/ExecutionError` 等错误应可诊断；遇到 transport-level 异常应尽快触发 `try_request_reconnect(...)`，让内核 supervision loop 统一治理退避与重连。
:::

#### 5.3.2 Handle 函数清单及详解

- `collect_data`: 批量采集数据。
- `collection_group_key`: (可选) 定义如何对设备进行分组采集。
::: details 什么时候应该使用 `group collection`

当且仅当你能回答一句话：**这些业务 Device 是否共享同一个“物理会话语义”，并且协议侧存在可用的批量能力？**

典型场景：

- **Modbus**：同一个 slave（站号）下的点位被拆成多个业务 Device（按产线/功能区/子设备建模），但物理上仍是“同一个 slave 一次批读/批写”。
- **OPC UA**：同一个 endpoint/channel/session 下，为了业务组织把 node 拆到多个业务 Device；物理上可以合并为一次 `Read`（或少量分批 Read）。
- **EtherNet/IP / MC / S7**：同一条连接（通常以 channel 为边界）内多个业务 Device 共享会话与 transport，适合合并为组调用以减少调度与协议请求次数。

反例（不要分组）：

- 每个业务 Device 必须独占连接（不同 IP/端口/串口），合并只会让慢设备拖累快设备，并放大 timeout 影响面。
- 协议不支持 batch，或 batch 导致稳定性变差（某些设备对大请求/大包非常敏感）。

`collection_group_key` 应该如何定义?

`CollectionGroupKey` 的语义必须是：**“可以共享一次物理采集/同一会话上下文的一组业务 Device”**。

必须遵守：

- **稳定**：不能用随机数、不能用会随重启/刷新变化的临时值。
- **低基数**：严禁包含 `device_id/point_id`（那等于不分组且会导致 HashMap 过大）。
- **无分配/低开销**：该方法运行在高频路径，必须做到 O(1) 且零分配。
- **表达物理会话语义**：通常来自协议层的“共享边界”，如 slaveId、channelId、endpoint/session identity 等。

**`具体例子：如何选择 key 的“物理语义”`**

- **例 1：Modbus（按 slaveId 分组）**
  - 适用：一个 slave 被拆成多个业务 Device。
  - key：`kind="MODB"` + `payload=slave_id`。
  - 参考实现：`ng-gateway-southward/modbus/src/handle.rs` 使用 `CollectionGroupKey::from_u64(kind, slave_id as u64)`。

- **例 2：OPC UA（按 channelId/endpoint 会话分组）**
  - 适用：同一个 OPC UA 连接/会话下的多个业务 Device 共享一次批量 Read。
  - key：`kind="OPCU"` + `payload=channel_id`（或 endpoint 的稳定 hash 前缀）。
  - 参考实现：`ng-gateway-southward/opcua/src/handle.rs` 以 `channel_id` 做分组。

- **例 3：多会话场景（按 “连接标识 + 子通道” 分组）**
  - 适用：一个 driver 内部维护多个物理会话（例如同一 channel 下有多个 target，且每个 target 需要独立连接池）。
  - key：用 `CollectionGroupKey::from_pair_u64(kind, a, b)` 组合两个稳定 id（注意它会截断为 48-bit，适合中小范围整数 id）。
  - 如果标识更复杂（host:port、证书指纹、endpoint URL 等），建议对其做稳定 hash（例如 128-bit），再用 `from_hash128(kind, hash128)` 截取前 12 bytes 作为 payload。

> 经验法则：**宁可少分组，也不要错分组**。错分组会导致协议语义错误（例如把不同 slave/不同 endpoint 混到同一批次），通常比“不分组导致慢一些”更难排障。

:::
- `collector_concurrency_profile(&self) -> CollectorConcurrencyProfile`（可选，声明采集并发能力：跨组并发 / 组内并发 / lane 数；用于保护设备/总线并让 Collector 自动适配）
- `write_point`: 写点位值。
- `execute_action`: 执行动作指令。
::: details `write_point/execute_action` 语义要点
- **超时**：`write_point(..., timeout_ms)` 应作为“单次操作上限”，避免无限等待（常用 `tokio::time::timeout`）
- **重连**：遇到 transport error/连续超时，应触发 `try_request_reconnect(reason)`，并返回可诊断错误（不要在热路径里 await 重连）
- **返回值**：使用 `WriteResult/ExecuteResult` 表达业务语义（Completed/Queued），不要把“排队成功”误报为“执行完成”
:::
- `apply_runtime_delta(delta) -> DriverResult<()>`

::: details `apply_runtime_delta(delta)` 深入说明
`apply_runtime_delta(delta)` 用于**在驱动运行过程中**接收来自 Host（网关）的**运行期模型增量变更**通知，并把这些变更**应用到驱动内部的长期状态**里（缓存、采集规划、订阅集、动作路由表等），从而做到：

- 不重启驱动/不重连设备（或尽量减少重连）就能让新增/删除/更新的设备、点位、动作生效
- 特别是在 **`CollectionType::Report`（订阅/事件上报）** 场景，避免出现“点位已变更但订阅集没更新”的数据错乱

它的语义不是“随便改一切配置”，而是**处理运行期 `RuntimeDelta` 事件**。目前 `RuntimeDelta` 只包含三类（按 channel 作用域、按序投递）：

- **`DevicesChanged`**：设备新增/更新/移除、以及设备 `status` 变化
- **`PointsChanged`**：某个设备下点位新增/更新/移除（包含点位 `driver_config` / transform 等运行期信息）
- **`ActionsChanged`**：某个设备下动作新增/更新/移除（命令定义、参数等）

**`什么时候必须实现？`**
- **订阅/上报（Report）模式几乎必须实现**：因为你通常会维护一个“订阅集/回调映射/点位快照（snapshot）/过滤规则”，点位变化后如果不更新，后果通常比采集模式更严重（漏报、错报、重复报、一直报已删除点位）。
- **采集（Collection）模式建议实现（非强制，且内置 polling 驱动也可能先做 no-op）**：因为 `collect_data()` 每次都会拿到最新的 `(device, points)`（`CollectItem`），所以很多纯 polling 驱动即使不实现 `apply_runtime_delta` 也能保持“功能正确”。但当你引入 Planner（批量合并策略）、地址/编解码缓存、设备会话表/连接池或后台 worker，并希望设备/点位变更能**快速生效**且尽量减少重启/重连时，实现 `apply_runtime_delta` 会显著提升一致性、性能与运维体验。

**`怎么用?`**

把它当成**控制面（control-plane）入口**来设计：快速接收变更、更新内存结构、必要时通知后台任务重建局部状态。

- **1）避免在 `apply_runtime_delta` 里做慢操作 / 网络 I/O**
  - 建议只做：更新内存结构、写入 `ArcSwap`/`RwLock`、向内部 actor/任务发送一条“变更消息”
  - 如果某类变更**必须**通过重建协议侧状态才能生效（例如：点位更新导致订阅键变化需要重建订阅；或设备/会话生命周期需要重建），建议在驱动内部触发“重连请求/重建流程”，而不是在这里同步阻塞等待

- **2）保持热路径并发安全**
  - `collect_data/write_point/execute_action` 可能与 `apply_runtime_delta` 并发发生（它们都是 handle 的入口）。
  - 推荐模式：**快照 + 原子替换**
    - 用 `ArcSwap`/`watch` 持有“点位快照/订阅配置快照/Planner 快照”
    - `apply_runtime_delta` 构建新快照并原子替换；热路径只读快照，避免长时间持锁

- **3）遵循“增量更新”而不是“全量重建”**
  - `PointsChanged` 已经把 added/updated/removed 分开给出，优先做局部变更：
    - added：解析并加入缓存/Planner；（订阅/上报模式）加入订阅集并补齐回调所需元信息
    - updated：更新编解码/transform/driver_config，并刷新缓存/Planner；若涉及订阅键/过滤策略变化，则触发重订阅或刷新回调快照
    - removed：从缓存/Planner/会话表中移除并清理关联状态；（订阅/上报模式）取消订阅，避免继续上报已删除点位

**`订阅/上报（Report）场景的关键注意事项`**

在 Report 模式下，驱动通常会有一个长期运行的“订阅管理器/回调线程/上报 actor”。`apply_runtime_delta` 的核心任务是让这些后台组件与最新模型保持一致：

- **点位新增（added）**：把点位转成协议侧订阅项（如 NodeId/IOA/Index 等），加入订阅管理器；并初始化上报所需的元信息（point_id、数据类型、transform）。
- **点位更新（updated）**：至少要考虑三类变化：
  - **订阅键变化**（例如 NodeId/地址/寄存器区间变化）：必须先取消旧订阅再订阅新项
  - **解码/变换变化**（datatype/scale/offset/negate 等）：需要更新回调路径的转换逻辑，否则会“值对了但语义错”
  - **上报策略变化**（如 change/always、死区/采样/过滤规则若由 driver_config 承载）：需要更新过滤器/聚合器状态
- **点位移除（removed）**：必须取消订阅并清理所有关联状态，避免继续从回调里发已删除点位的数据（这是最常见的隐藏 bug）。

建议把“订阅管理”做成一个内部 actor，并提供两类消息：

- `UpdateSubscription { added, updated, removed }`：只做订阅集增量调整（尽量批量化）
- `UpdateSnapshot { new_snapshot }`：原子替换回调处理所依赖的快照（点位元数据/transform/路由）

**`常见坑`**
- **只更新内存点位表，但忘记更新订阅集**：表现为新增点不上报、删点仍在报、或回调里找不到 point_id。
- **在 `apply_runtime_delta` 里同步做 I/O**（取消/创建订阅、探测设备能力等）：会把控制面阻塞成“慢路径”，在高频变更或弱网环境下容易拖垮驱动。
- **用一把大锁保护所有状态**：热路径会被 runtime delta 频繁阻塞；建议用快照/分层锁/actor 消息化降低争用。

一句话：`apply_runtime_delta` 是让驱动“**在线演进**”的关键入口；在订阅/上报模式下，它决定了你的订阅/映射集与点位模型的始终一致性。
:::

::: details `handle.rs`

```rust
use ng_gateway_sdk::{
    SouthwardHandle, DriverResult, CollectItem, NorthwardData, DriverError,
    RuntimeDevice, RuntimePoint, NGValue, WriteResult, RuntimeAction, RuntimeParameter, ExecuteResult
};
use ng_gateway_sdk::supervision::ReconnectHandle;
use tokio::sync::Mutex;
use tokio::net::TcpStream;
use std::sync::Arc;

pub struct YourHandle {
    // 使用 Mutex 保护共享资源，注意锁的粒度
    transport: Arc<Mutex<Option<TcpStream>>>,
    reconnect: Arc<Mutex<Option<ReconnectHandle>>>,
}

impl YourHandle {
    pub fn new() -> Self {
        Self {
            transport: Arc::new(Mutex::new(None)),
            reconnect: Arc::new(Mutex::new(None)),
        }
    }
    
    pub fn attach_transport(&self, stream: TcpStream, reconnect: ReconnectHandle) {
        *self.transport.blocking_lock() = Some(stream);
        *self.reconnect.blocking_lock() = Some(reconnect);
    }
    
    pub fn detach_transport(&self) {
        *self.transport.blocking_lock() = None;
    }
    
    fn request_reconnect(&self, reason: &str) {
        if let Some(h) = self.reconnect.blocking_lock().as_ref() {
            h.try_request_reconnect(reason);
        }
    }
}

#[async_trait::async_trait]
impl SouthwardHandle for YourHandle {
    async fn collect_data(&self, items: &[CollectItem]) -> DriverResult<Vec<NorthwardData>> {
        let mut guard = self.transport.lock().await;
        let stream = guard.as_mut().ok_or(DriverError::ServiceUnavailable)?;
        
        // 1. 组装报文
        // 2. 发送请求 (带超时)
        // 3. 接收响应 (带超时)
        // 4. 解析数据
        
        // 示例：遇到 I/O 错误
        // self.request_reconnect("IO Error");
        // return Err(DriverError::SessionError(...));
        
        Ok(vec![])
    }

    async fn write_point(
        &self,
        device: Arc<dyn RuntimeDevice>,
        point: Arc<dyn RuntimePoint>,
        value: &NGValue,
        timeout_ms: Option<u64>,
    ) -> DriverResult<WriteResult> {
        // 1. Downcast：获取驱动特定的 Runtime 结构
        let device = device.downcast_ref::<YourProtoDevice>()
            .ok_or(DriverError::ConfigurationError("Invalid device type".into()))?;
        let point = point.downcast_ref::<YourProtoPoint>()
            .ok_or(DriverError::ConfigurationError("Invalid point type".into()))?;

        // 2. Encode：将 NGValue 转换为协议原始值/字节流
        //    (建议在 codec 模块实现，处理类型转换、字节序等)
        // let raw_payload = codec::encode_write(value, point.data_type, point.address)?;

        // 3. Acquire Transport：获取连接
        let mut guard = self.transport.lock().await;
        let stream = guard.as_mut().ok_or(DriverError::ServiceUnavailable)?;

        // 4. Execute：执行协议写请求 (带超时)
        //    stream.write_all(&raw_payload).await?;
        //    stream.read_response().await?;

        Ok(WriteResult {
            outcome: ng_gateway_sdk::WriteOutcome::Applied,
            applied_value: Some(value.clone()),
        })
    }
    
    async fn execute_action(
        &self,
        device: Arc<dyn RuntimeDevice>,
        _action: Arc<dyn RuntimeAction>,
        params: Vec<(Arc<dyn RuntimeParameter>, NGValue)>,
    ) -> DriverResult<ExecuteResult> {
         // 1. Downcast
         let device = device.downcast_ref::<YourProtoDevice>()
            .ok_or(DriverError::ConfigurationError("Invalid device type".into()))?;
         
         // 2. Resolve Parameters：将通用参数列表转换为驱动强类型参数
         //    (SDK 提供了辅助函数 downcast_parameters)
         let typed_params = ng_gateway_sdk::downcast_parameters::<YourProtoParameter>(params)?;
         
         // 3. Build Command：根据动作定义和参数构建协议指令
         // let cmd_frame = codec::build_action_frame(&typed_params)?;

         // 4. Execute
         // ... 获取连接并发送 ...

         Ok(ExecuteResult {
             outcome: ng_gateway_sdk::ExecuteOutcome::Completed,
             payload: Some(serde_json::json!({ "status": "ok" })),
         })
    }
}
```

:::

#### 5.3.4 最佳实践

::: details `热路径性能清单`
- **零拷贝优先**：尽量在 `&[u8]`/`Bytes` 上解析；避免在循环中反复 `Vec::new()`
- **预分配**：`Vec::with_capacity(items.len())`、`HashMap::with_capacity(n)`
- **减少锁争用**：优先无锁读（如 ArcSwap / watch），必要锁要缩短临界区
- **批量化**：将多个点位合并为尽可能少的协议请求（Planner）
- **并发受控**：
  - RTU/RS-485：通常必须单飞（避免总线冲突）
  - TCP：可用连接池/并发在飞，但要尊重设备能力与网关资源
> 驱动开发时你需要把批量处理/合并请求这些策略抽象为可配置的 Planner，并把默认值设计成“保守但不太慢”。
:::

::: details `正确处理超时、重试与退避`
驱动端一般会遇到两类重试：

- **连接生命周期重试（交给网关内核的 supervision loop）**  
由 `connection_policy.backoff` 驱动（宏已经把 policy 注入到 `SupervisorParams.retry_policy`）。  
驱动要做的是：**正确分类错误**（Retryable vs Fatal）。

- **协议请求级别重试（谨慎使用）**  
例如单次读写请求超时后立刻重试 1 次。  
建议原则：
  - 限制次数（例如最多 1-2 次）
  - 退避 + jitter（避免风暴）
  - 只对明确的瞬时错误重试（超时/连接重置），不要对“非法响应/协议错误”重试
:::

::: details `错误分类与上下文（Retryable vs Fatal，合并「严禁 unwrap/expect」）`
驱动是网关稳定性的底座。你需要把错误分成**可重试（Retryable）**与**不可重试（Fatal）**，让 supervision loop 能做出正确决策；同时必须保证任何 I/O、解析、类型转换都通过 `Result` 返回，**严禁** `unwrap()` / `expect()` 导致 panic。

建议把错误至少分为三层（从“系统动作”视角定义）：

- **连接级别 Fatal（立即失败，等待配置/环境修复）**
  - 配置错误：必填字段缺失、类型不匹配、非法端口/地址范围、点位定义不合法
  - 认证/授权不可用：凭据缺失、权限被永久拒绝（例如 401/403 且明确不可恢复）
  - TLS 校验失败：证书链不可信、主机名校验失败、证书过期（除非你明确支持热更新凭据/证书，否则应视为 Fatal）

- **连接级别 Retryable（交给 supervision loop 退避重连）**
  - 网络/传输瞬时失败：`ConnectionRefused`、`ConnectionReset`、`BrokenPipe`、DNS 临时失败
  - I/O 超时：连接建立超时、读写超时（注意与协议级超时区分）
  - 资源瞬时不足：系统负载过高、临时资源不足（通常配合背压与限流一起治理）

- **请求/响应级别错误（多数不应触发“立刻重连风暴”）**
  - **协议超时/无响应**：一般可重试 1 次（有退避 + jitter），连续失败再上升为连接级 Retryable
  - **协议错误/非法响应/解码失败**：默认 **Fatal（对该请求）**，通常不应立即重试；需要输出充分上下文以便排障
  - **设备侧异常响应**（例如协议定义的 exception/错误码）：默认 **Fatal（对该请求）**；是否需要重连取决于协议与设备行为（多数情况下不需要）

实现建议（可操作、可审计）：

- **不要用 panic 表达“不可达”**：驱动边界上的任何失败都应该是 `Result::Err`，并携带上下文；`Option`/downcast 使用 `ok_or(...)` / `ok_or_else(...)`。
- **错误要“可被机器判断 + 可被人排查”**：
  - 机器判断：用清晰的 error kind（Retryable/Fatal、Config/Transport/Protocol/Auth/Backpressure 等）
  - 人类排查：在错误中补齐关键上下文（下面清单）
- **错误上下文字段清单（推荐至少包含）**：
  - 业务定位：`channel_id / device_id / point_id`（如可得）、driver 名称、目标端点（IP:port / serial path / slave id）
  - 协议定位：function code、address、quantity、transaction id / sequence（如果协议有）
  - 时序定位：timeout 配置值、attempt（第几次尝试）、elapsed（耗时）
  - 数据定位：响应长度、期望长度、CRC/校验信息、（可选）截断后的 hex dump（仅在 `trace` 级别且必须限长）
  - 底层错误链：io error、timeout error、decode error（保持原始错误作为 source）

> 经验法则：如果你在日志/错误里看不到“**哪台设备、哪条链路、哪次请求、哪段协议**”，那这个错误等同于“不可观测”。
:::

::: details `背压边界（Backpressure）：把压力挡在驱动边界之外`
网关的稳定性来自“明确的背压边界”。驱动需要保证：当上游（采集调度/写入请求）变大时，驱动不会无限制创建任务、无限制堆积内存、也不会把设备/链路打爆。

推荐的背压策略（按优先级从强到弱）：

- **并发上限（硬边界）**：对每个连接/设备设置 `max_in_flight`（典型实现为 `Semaphore`）。
  - RTU/RS-485：通常必须 **`max_in_flight = 1`**（避免总线冲突并保持时序）
  - TCP：可适当提高，但必须尊重设备能力与网关资源（CPU/内存/带宽）

- **有界队列（内存边界）**：采集/写入请求必须进入**有界**缓冲（bounded channel/queue）。
  - 队列满时的处理策略必须明确：**拒绝（返回 Backpressure）/ 合并（coalesce）/ 丢弃过期读**，避免“看似成功实际堆积”。

- **批量与合并（减少请求数）**：Planner 应优先把多个点位合并为更少的协议请求；当背压出现时优先提升合并力度，而不是增加重试次数。

- **超时与取消（防止僵尸请求）**
  - 每个 I/O 必须有超时；任务应支持取消（例如 shutdown 信号 / `select!` 分支）
  - 当上游取消或超时后，驱动不得继续把结果写回（避免“过期数据回灌”）

可观测性建议：

- **背压必须可观测**：记录 backpressure 的触发次数、拒绝次数、队列长度/等待时间（注意避免高基数字段）。
- **背压错误应该是“可重试但需要降速”**：上游看到 Backpressure 应减少频率/并发，而不是立刻重试风暴。
:::

::: details `TLS / 凭据 / 日志：安全与可运维性底线`
驱动一旦涉及网络（TCP/TLS/HTTP/MQTT 桥接等），安全与可运维性是“默认要求”，不是加分项。

- **TLS（建议基于 rustls/系统信任库）**
  - 必须开启证书校验与主机名校验；**禁止**为了“连上就行”而关闭验证
  - 支持自定义 CA（企业内网/自签）、证书轮换（更新后无需重启是加分项）
  - 若使用 mTLS：客户端证书/私钥的缺失或无效应明确报错（多数场景视为 Fatal）
  - TLS 错误日志要可排障但不泄密：只输出失败原因与证书摘要信息（如 subject/issuer/有效期），不要输出私钥或完整证书内容

- **凭据（Credentials）**
  - 把 token/密码/私钥当作 secret：不要写入日志、不要 `Debug` 打印、不要在错误字符串中拼接
  - 建议对敏感字段做显式脱敏（redaction）：例如只保留前后各 2-4 位，其余用 `***` 代替
  - 错误消息中可以包含“凭据缺失/无效”的结论，但不能包含凭据本体

- **日志（tracing）**
  - 结构化记录关键事件：连接建立/断开、重连退避、请求超时、协议异常、背压触发
  - 记录足够上下文（device/channel/endpoint/request），但避免高基数（不要把 point value、全量 payload、随机 id 当字段）
  - 原始 payload（hex dump/json）只允许在 `trace` 级别、必须限长、并且必须确认不包含凭据/隐私数据
  - 对“可预期的瞬时错误”（例如短暂超时）使用 `warn`；对“不可恢复/需要人工介入”的错误使用 `error`
:::

## 6. 可观测性

### 6.1 日志（tracing）最佳实践

NG Gateway内核会在加载驱动时：

- 注册 host log sink（`ng_driver_set_log_sink`）
- 初始化驱动 tracing（`ng_driver_init_tracing`）
- 支持动态日志级别设置（`ng_driver_set_max_level`）

因此驱动侧应该遵循:

- 使用 `tracing::info!`, `warn!`, `error!` 记录关键事件。
- 热`debug!`, `trace!` 用于开发调试及热路径，生产环境通常关闭。
- 日志字段尽量结构化且携带上下文：`tracing::info!(channel_id=?, device_id=?, ...)`

### 6.2 指标（Observer）使用原则

- **SDK 会自动收集连接状态、采集频率等基础指标。**
- **驱动册只需关心数据面字节计量交给`transport_meter`**
  - 使用 SDK 提供的 metered 连接/包装器（如 `connect_tcp_metered_with_timeout` / `connect_serial_metered` / `MeteredStream`）让 read/write 自动计量；不要在业务循环里手写 byte counter（容易漏算/误算，也会污染热路径）。

## 7. lib.rs 导出 ABI Factory

```rust
use ng_gateway_sdk::ng_driver_factory;
use crate::connector::YourConnector;
use crate::metadata::build_metadata;
use crate::converter::YourConverter;

ng_driver_factory!(
    name = "YourProto",
    description = "Driver for Your Protocol",
    driver_type = "your-proto", // 全局唯一标识
    component = YourConnector,
    metadata_fn = build_metadata,
    model_convert = YourConverter 
);
```

## 8. 测试策略

### 8.1 单元测试

- codec：字节序/字序、类型转换、边界值、非法数据容错
- planner：批量合并算法、span 上限 clamp、gap 策略
- model convert：配置合法性、默认值、非法输入报错语义

### 8.2 集成测试

- 启动模拟器
- 编写测试用例，通过 `Connector` 连接模拟器，验证：
  - 正常读写路径
  - 超时、断链、重连
  - 并发压力（验证背压与内存上限）

### 8.3 性能基准测试

仓库已有 `ng-gateway-bench`（可参考其 Modbus bench 入口）：

- codec micro-bench（每次 decode 的 ns/op）
- planner bench（点位规模扩展：1k/10k points）
- end-to-end bench（采集→northward 输出）

## 9. 调试与发布

### 9.1 完整流程

1) 启动后端（建议 debug + 跳过 UI build，加快迭代）
   - 详见：[`本地开发`](/dev/local-dev)
2) 启动 WebUI（推荐 dev server 联调后端）
3) 在 WebUI 完成 **驱动安装 → 探测（probe）→ 启用**
   - 重点关注：版本信息、`api_version`/`sdk_version`、架构与 checksum 是否符合预期
4) 在 WebUI 创建并配置 **Channel/Device/Point/Action**
   - 用最小可用配置先跑通（能连上、能采集/能写回）
5) 观测与排障（只看“低频、可聚合”的关键信号）
   - 失败分类是否稳定（`error_code/error_summary`）
   - `FailurePhase` 与重连原因（`try_request_reconnect(reason)`）是否低基数/可统计
   - 吞吐/延迟是否按“批/次”聚合（严禁 per-point）

### 9.2 发布与兼容性清单

- **多平台产物**：Linux/macOS/Windows 的扩展名不同（`.so/.dylib/.dll`），并确保目标架构匹配
- **WebUI 探测（probe）必须通过**：确保导出元数据可读、类型/名称/版本正确，且能展示 Probe 信息
- **自定义驱动升级方式**：发布新版本产物后通过 WebUI 安装覆盖，并在 probe 页确认 `version/checksum` 已更新（文件落盘在 `drivers/custom`）
- **ABI/API 版本**：loader 会校验 `ng_driver_api_version` 与 host 一致
- **SDK 版本**：当前策略为非严格（不一致会 warn），但不建议跨大版本
- **配置兼容**：Schema path 与配置字段保持向后兼容；新增字段要提供默认值

## 10. 常见坑

- **在 `Connector::new()` 里做了 I/O**：会导致启动阶段阻塞、并且违反 SDK 契约（未来可能直接拒绝）
- **把字符串地址/表达式解析放到热路径**：吞吐下降明显，且更难排障
- **错误分类过粗**：所有错误都 Retryable 会导致无意义重试风暴；所有错误都 Fatal 会导致短暂波动直接挂死
- **RTU 误并发**：RS-485 总线并发写/读可能造成设备异常或串口驱动混乱
- **缺少背压策略**：采集速度 > 处理速度时内存会快速膨胀（即使有 bounded channel，也可能在驱动内部 buffer 堆积）

## 11. 关键 Demo 代码详解

### 1) Converter：字段级约束在哪里生效？

以 Modbus point 为例，converter 会在 runtime 转换阶段强制要求字段存在且范围合法：

- `functionCode` 必须存在且是数字，并且能映射到合法枚举
- `address` 必须存在且在 `u16` 范围
- `quantity` 缺省为 1，并强制 >=1

这保证了热路径不需要在每次采集时做重复校验（性能与稳定性收益都很大）。

关键代码：
::: details 点击展开：`关键片段`
```rust
fn extract_point_driver_config(
    driver_config: serde_json::Value,
) -> DriverResult<(ModbusFunctionCode, u16, u16)> {
    let function_code = driver_config
        .get("functionCode")
        .ok_or(DriverError::ConfigurationError(
            "functionCode is required".to_string(),
        ))
        .and_then(Self::parse_function_code)?;

    let address = driver_config
        .get("address")
        .and_then(|v| v.as_u64())
        .ok_or(DriverError::ConfigurationError(
            "address is required".to_string(),
        ))
        .and_then(|v| {
            u16::try_from(v).map_err(|_| DriverError::ConfigurationError("address out of range".to_string()))
        })?;

    let quantity = driver_config
        .get("quantity")
        .and_then(|v| v.as_u64())
        .unwrap_or(1);
    let quantity = u16::try_from(quantity)
        .map_err(|_| DriverError::ConfigurationError("quantity out of range".to_string()))?
        .max(1);

    Ok((function_code, address, quantity))
}
```
:::

### 2) Connector：TCP/RTU 的“连接池策略”怎么落地？

Modbus 的 `connect_pool()` 做了两件生产级必须做的事：

- **TCP**：按 `tcpPoolSize` 建立 pool，并 clamp 到 1..=32（避免配置把 PLC/网关打爆）
- **RTU**：强制单飞（pool size=1），保证串口总线语义

并且：connect 过程尊重 `ctx.cancel`，避免 shutdown 卡死。

关键代码：

::: details 点击展开：`关键片段`
```rust
async fn connect_pool(
    &self,
    ctx: &SessionContext,
    cfg: &ModbusChannelConfig,
) -> DriverResult<Arc<SessionPool>> {
    match &cfg.connection {
        ModbusConnection::Tcp { host, port } => {
            let addr = format!("{host}:{port}")
                .parse::<SocketAddr>()
                .map_err(|e| DriverError::ConfigurationError(format!("Invalid socket address: {e}")))?;
            let size = cfg.tcp_pool_size.clamp(1, 32) as usize;
            let mut contexts = Vec::with_capacity(size);
            for _ in 0..size {
                let fut = connect_tcp_metered_with_timeout(
                    addr,
                    Arc::clone(&self.transport_meter),
                    self.channel.connection_policy.connect_timeout_ms,
                );
                let stream = tokio::select! {
                    _ = ctx.cancel.cancelled() => {
                        return Err(DriverError::ServiceUnavailable);
                    }
                    res = fut => res.map_err(|e| DriverError::SessionError(format!("Modbus TCP connect error: {e}")))?,
                };
                contexts.push(tcp::attach(stream));
            }
            Ok(Arc::new(SessionPool::new(contexts)))
        }
        ModbusConnection::Rtu { port, baud_rate, data_bits, stop_bits, parity } => {
            if ctx.cancel.is_cancelled() {
                return Err(DriverError::ServiceUnavailable);
            }
            let stream = connect_serial_metered(
                SerialConnectConfig {
                    port: port.to_string(),
                    baud_rate: *baud_rate,
                    data_bits: (*data_bits).into(),
                    stop_bits: (*stop_bits).into(),
                    parity: (*parity).into(),
                },
                Arc::clone(&self.transport_meter),
            )
            .map_err(|e| DriverError::SessionError(format!("Failed to open serial port {port}: {e}")))?;
            Ok(Arc::new(SessionPool::new(vec![rtu::attach(stream)])))
        }
    }
}
```
:::

### 3) Session：Ready 的定义要“明确、低成本”

Modbus 没有复杂握手，session 的 Ready 定义就是“连接/连接池已建立且可用”。因此：

- `Session::init()`：把 reconnect handle + pool 注入到 data-plane handle（**publish handle 的依赖**）
- `Session::run()`：等待 cancel；退出时断开所有 context（带 timeout）

这是一种非常好的“attempt 资源边界”写法，如有需要你的新驱动可以直接复用这种结构。

关键代码：

::: details 点击展开：`关键片段`
```rust
async fn init(&mut self, ctx: &SessionContext) -> Result<(), Self::Error> {
    self.handle.set_reconnect(ctx.reconnect.clone());
    self.handle.attach_pool(Arc::clone(&self.pool));
    Ok(())
}

async fn run(self, ctx: SessionContext) -> Result<RunOutcome, Self::Error> {
    ctx.cancel.cancelled().await;
    if let Some(pool) = self.handle.detach_pool() {
        pool.disconnect_all(std::time::Duration::from_secs(2)).await;
    }
    Ok(RunOutcome::Disconnected)
}
```
:::

### 4) Handle：超时/传输错误如何触发重连？

Modbus handle 的核心是 `run_op()`：

- 使用 `tokio::time::timeout` 给每次协议操作设置上限（避免无限等待）
- 捕获 transport error / timeout 时：
  - 记录结构化 warn
  - `try_request_reconnect(...)`（**不 await**，避免阻塞热路径）
  - 返回可诊断的错误给上层

这能把“弱网/设备偶发异常”从热路径中快速隔离，并让 supervision loop 统一治理重连与退避。

关键代码：

::: details 点击展开：`关键片段`
```rust
#[inline]
fn try_request_reconnect(&self, reason: &'static str) {
    if let Some(h) = self.reconnect.get() {
        let _ = h.try_request_reconnect(reason);
    }
}

#[inline]
fn pick_ctx(&self) -> DriverResult<Arc<Mutex<Context>>> {
    let pool = self.pool.load_full();
    let Some(pool) = pool else {
        self.try_request_reconnect("modbus no session pool");
        return Err(DriverError::ServiceUnavailable);
    };
    pool.pick().ok_or_else(|| {
        self.try_request_reconnect("modbus empty session pool");
        DriverError::ServiceUnavailable
    })
}

async fn run_op<T, F, Fut>(
    &self,
    ctx: Arc<Mutex<Context>>,
    op_timeout_ms: u64,
    op_label: &'static str,
    op: F,
) -> DriverResult<T>
where
    F: FnOnce(Arc<Mutex<Context>>) -> Fut + Send + 'static,
    Fut: Future<Output = Result<Result<T, ExceptionCode>, tokio_modbus::Error>> + Send + 'static,
    T: Send + 'static,
{
    let duration = StdDuration::from_millis(op_timeout_ms.max(1));
    match timeout(duration, op(Arc::clone(&ctx))).await {
        Ok(Ok(inner)) => inner.map_err(|code| {
            DriverError::ExecutionError(format!("Modbus exception on {op_label}: {code:?}"))
        }),
        Ok(Err(e)) => {
            let msg = e.to_string();
            warn!(op = op_label, err = %msg, "Transport error, request reconnect");
            self.try_request_reconnect("modbus transport error");
            Err(DriverError::ExecutionError(msg))
        }
        Err(_) => {
            warn!(op = op_label, "Operation timeout, request reconnect");
            self.try_request_reconnect("modbus timeout");
            Err(DriverError::Timeout(tokio::time::Duration::from_millis(op_timeout_ms.max(1))))
        }
    }
}
```
:::
