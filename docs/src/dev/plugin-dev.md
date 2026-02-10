---
title: 北向插件开发
description: 面向 Kafka/Pulsar/ThingsBoard 等目标平台，按步骤从 0 到 1 开发一个可上线的生产级北向插件：接口契约、配置/元数据、背压与队列、错误处理、测试与发布。
---

# 北向插件开发

本章面向 **插件开发者**，目标是让你能按步骤完成一个 **生产级** 的北向插件（Northward Plugin）：

- **能被网关动态加载**：以 `cdylib` 形式发布。
- **能被 UI 自动建模**：通过 Plugin Metadata Schema 自动渲染配置表单。
- **高可靠与高性能**：支持背压、断点续传（依赖队列）、低延迟转发。

本文结构适用于开发 Kafka, Pulsar, MQTT, HTTP 等各类北向数据转发插件。

## 0. 前置条件与硬性约束

### 0.1 你需要准备什么

- **Rust 开发环境**：安装最新 stable 工具链。
- **网关本地环境**：参考 [本地开发](/dev/local-dev) 搭建好后端与 WebUI。
- **目标平台环境**：准备好你要对接的平台（如 Kafka Broker, MQTT Broker, HTTP Server）。

### 0.2 硬性约束

::: warning 必须遵守的契约
1. **`metadata_fn` 必须纯**：不得读文件、环境变量或网络。
2. **`Connector::new(ctx)` 必须同步且无 I/O**。
3. **热路径（`NorthwardHandle`）禁止阻塞**：`process_data` 必须极快，仅做数据转换和入队，禁止直接进行网络 I/O。
4. **必须实现背压**：内部必须维护有界队列，当队列满时应明确拒绝或丢弃，防止 OOM。
5. **严禁 `unwrap()` / `expect()`**。
:::

## 1. 创建插件 crate

### 1.1 Cargo.toml 最小约束

```toml
[package]
name = "ng-plugin-yourtarget"
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

## 2. 创建插件模块

### 2.1 推荐工程模块

```text
ng-plugin-yourtarget/
  Cargo.toml
  src/
    lib.rs         // 导出 factory
    metadata.rs    // UI Schema
    config.rs      // 运行时配置结构
    converter.rs   // Config 转换
    connector.rs   // Connector 实现
    session.rs     // Session 实现 (负责 I/O)
    handle.rs      // NorthwardHandle 实现 (热路径，负责入队)
```

### 2.2 工程模块边界

- **导出层 (`lib.rs`)**：`ng_plugin_factory!`。
- **配置层 (`metadata.rs`, `config.rs`)**：定义配置结构与 UI。
- **连接层 (`connector.rs`, `session.rs`)**：管理与目标平台的连接，消费内部队列数据并发送。
- **热路径层 (`handle.rs`)**：接收网关数据，转换为目标格式，写入内部队列。

## 3. 配置及 Schema

### 4.1 config.rs/types.rs - 运行时配置

```rust
use ng_gateway_sdk::PluginConfig;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YourPluginConfig {
    pub endpoint: String,
    pub topic: String,
    #[serde(default = "default_queue_size")]
    pub queue_size: usize,
}

fn default_queue_size() -> usize { 1000 }

impl PluginConfig for YourPluginConfig {}
```

### 4.2 metadata.rs - UI Schema

```rust
use ng_gateway_sdk::{
    ui_text, PluginConfigSchemas, Field, Node, Rules, RuleValue, UiDataType, Group
};
use serde_json::json;

pub(super) fn build_metadata() -> PluginConfigSchemas {
    vec![
        Node::Group(Group {
            id: "connection".into(),
            label: ui_text!(en = "Connection", zh = "连接配置"),
            children: vec![
                Node::Field(Box::new(Field {
                    path: "endpoint".into(),
                    label: ui_text!(en = "Endpoint", zh = "服务端地址"),
                    data_type: UiDataType::String,
                    rules: Some(Rules { required: Some(RuleValue::Value(true)), ..Default::default() }),
                    ..Default::default()
                })),
                // ... topic, queue_size 等
            ],
            ..Default::default()
        })
    ]
}
```

### 4.3 Schema 设计要点

- **分组 (Group)**：北向配置通常较多，建议使用 Group 进行逻辑分组（如连接、认证、高级）。
- **校验**：确保 endpoint 格式正确，queue_size 在合理范围内。

## 4. 实现 Model Convert

**职责**：将 `serde_json::Value` 转换为 `YourPluginConfig`，并进行预处理。

```rust
use ng_gateway_sdk::{NorthwardResult, NorthwardError, PluginConfig};
use ng_gateway_sdk::supervision::converter::NorthwardModelConverter;
use std::sync::Arc;
use crate::config::YourPluginConfig;

#[derive(Default)]
pub struct YourConverter;

impl NorthwardModelConverter for YourConverter {
    fn convert_plugin_config(&self, config: serde_json::Value) -> NorthwardResult<Arc<dyn PluginConfig>> {
        let cfg: YourPluginConfig = serde_json::from_value(config)
            .map_err(|e| NorthwardError::ConfigurationError { message: e.to_string() })?;
            
        if cfg.queue_size == 0 {
            return Err(NorthwardError::ConfigurationError { message: "Queue size must be > 0".into() });
        }
        
        Ok(Arc::new(cfg))
    }
}
```

## 5. 实现 Connector / Session / Handle

### 5.1 Connector

#### 5.1.1 Connector 职责、生产级建议

- **职责**：创建 `Session` 和 `Handle`，初始化内部通道（Channel）。
- **建议**：
  - 创建一个 `mpsc::channel` 连接 `Handle` (生产者) 和 `Session` (消费者)。
  - `new` 方法不做 I/O。

#### 5.1.2 Connector Demo 代码

```rust
use ng_gateway_sdk::supervision::{Connector, Session, SessionContext, FailureKind, FailurePhase};
use ng_gateway_sdk::{NorthwardError, NorthwardInitContext};
use std::sync::Arc;
use tokio::sync::mpsc;
use crate::session::YourSession;
use crate::handle::YourHandle;
use crate::config::YourPluginConfig;

pub struct YourConnector {
    config: Arc<YourPluginConfig>,
    // 临时保存 sender，在 connect 时传给 Handle，或者在 new 时就创建好 Handle
    sender: mpsc::Sender<Vec<u8>>, 
    receiver: Arc<tokio::sync::Mutex<Option<mpsc::Receiver<Vec<u8>>>>>,
}

impl YourConnector {
    // 在 new 中初始化 channel
}

#[async_trait::async_trait]
impl Connector for YourConnector {
    type InitContext = NorthwardInitContext;
    type Handle = YourHandle;
    type Session = YourSession;

    fn new(ctx: Self::InitContext) -> Result<Self, NorthwardError> {
        let config = ctx.config.downcast_arc::<YourPluginConfig>()
            .map_err(|_| NorthwardError::ConfigurationError { message: "Invalid config type".into() })?;
            
        let (tx, rx) = mpsc::channel(config.queue_size);
        
        Ok(Self {
            config,
            sender: tx,
            receiver: Arc::new(tokio::sync::Mutex::new(Some(rx))),
        })
    }

    async fn connect(&self, ctx: SessionContext) -> Result<Self::Session, NorthwardError> {
        // 建立到目标平台的连接
        let client = some_client::connect(&self.config.endpoint).await?;
        
        // 获取 receiver (注意：这里简化了逻辑，实际可能需要处理 receiver 的所有权转移)
        let mut rx_guard = self.receiver.lock().await;
        let rx = rx_guard.take().ok_or(NorthwardError::SessionError("Receiver already taken".into()))?;
        
        let handle = Arc::new(YourHandle::new(self.sender.clone()));
        
        Ok(YourSession::new(handle, client, rx))
    }
    
    // classify_error ...
}
```

### 5.2 Session

#### 5.2.1 Session 职责、生产级建议

- **职责**：从内部队列消费数据，发送到目标平台。
- **建议**：
  - 批量消费：一次从 channel 读取多条数据进行批量发送，提高吞吐。
  - 异常处理：发送失败时触发重连。

#### 5.2.2 Session Demo 代码

```rust
use ng_gateway_sdk::supervision::{Session, SessionContext, RunOutcome};
use ng_gateway_sdk::NorthwardError;
use std::sync::Arc;
use tokio::sync::mpsc;
use crate::handle::YourHandle;

pub struct YourSession {
    handle: Arc<YourHandle>,
    client: SomeClient,
    rx: mpsc::Receiver<Vec<u8>>,
}

impl YourSession {
    pub fn new(handle: Arc<YourHandle>, client: SomeClient, rx: mpsc::Receiver<Vec<u8>>) -> Self {
        Self { handle, client, rx }
    }
}

#[async_trait::async_trait]
impl Session for YourSession {
    type Handle = YourHandle;
    type Error = NorthwardError;

    fn handle(&self) -> &Arc<Self::Handle> {
        &self.handle
    }

    async fn init(&mut self, _ctx: &SessionContext) -> Result<(), Self::Error> {
        Ok(())
    }

    async fn run(mut self, ctx: SessionContext) -> Result<RunOutcome, Self::Error> {
        loop {
            tokio::select! {
                _ = ctx.cancel.cancelled() => return Ok(RunOutcome::Disconnected),
                msg = self.rx.recv() => {
                    match msg {
                        Some(data) => {
                            if let Err(e) = self.client.send(data).await {
                                // 发送失败，请求重连
                                ctx.reconnect.try_request_reconnect("Send failed");
                                return Ok(RunOutcome::ReconnectRequested("Send failed".into()));
                            }
                        }
                        None => return Ok(RunOutcome::Disconnected), // Channel closed
                    }
                }
            }
        }
    }
}
```

### 5.3 Handle

#### 5.3.1 Handle 职责、生产级建议、热路径契约

- **职责**：接收 `NorthwardData`，序列化，入队。
- **契约**：
  - **极速**：仅做内存操作。
  - **背压**：如果队列满，返回错误或丢弃（根据策略）。

#### 5.3.2 Handle 函数清单及详解

- `process_data`: 处理上行数据。
- `send_downlink`: (可选) 处理下行指令。

#### 5.3.3 Handle Demo 代码

```rust
use ng_gateway_sdk::{
    NorthwardHandle, NorthwardResult, NorthwardData, NorthwardError
};
use tokio::sync::mpsc;

pub struct YourHandle {
    sender: mpsc::Sender<Vec<u8>>,
}

impl YourHandle {
    pub fn new(sender: mpsc::Sender<Vec<u8>>) -> Self {
        Self { sender }
    }
}

#[async_trait::async_trait]
impl NorthwardHandle for YourHandle {
    async fn process_data(&self, data: NorthwardData) -> NorthwardResult<()> {
        // 1. 序列化数据 (例如转为 JSON)
        let payload = serde_json::to_vec(&data)
            .map_err(|e| NorthwardError::ExecutionError(e.to_string()))?;
            
        // 2. 入队 (使用 try_send 避免阻塞，或 send_timeout)
        self.sender.try_send(payload).map_err(|_| NorthwardError::BufferFull)?;
        
        Ok(())
    }
}
```

### 5.4 最佳实践

::: details 展开查看详细说明
- **背压边界**：`mpsc::channel` 的容量必须是有限的。
- **错误分类**：连接断开属于 Retryable，配置错误属于 Fatal。
- **TLS/凭据/日志**：妥善处理敏感信息。
- **热路径红线**：`process_data` 绝对不能进行网络请求。
- **重试与退避**：依赖 SDK 的 Supervision Loop。
:::

## 6. 可观测性

### 6.1 日志（tracing）最佳实践

- 记录连接建立、断开、重连事件。
- 记录发送失败的错误信息。

### 6.2 指标（Observer）使用原则

- 监控内部队列长度（Queue Depth）。
- 监控发送成功/失败计数。

## 7. lib.rs 导出 ABI Factory

```rust
use ng_gateway_sdk::ng_plugin_factory;
use crate::connector::YourConnector;
use crate::metadata::build_metadata;
use crate::converter::YourConverter;

ng_plugin_factory!(
    name = "YourTarget",
    description = "Plugin for Your Target Platform",
    plugin_type = "your-target",
    component = YourConnector,
    metadata_fn = build_metadata,
    model_convert = YourConverter
);
```

## 8. 测试策略

### 8.1 单元测试

- 测试 `converter` 配置解析。
- 测试 `handle` 的序列化逻辑。

### 8.2 集成测试

- 启动目标平台（如 Kafka）。
- 发送模拟数据，验证平台是否收到。

### 8.3 性能基准测试

- 压测 `process_data` 的吞吐量。
- 观察高负载下的队列堆积情况。

## 9. 调试与发布

### 9.1 完整流程

1. **启动后端**。
2. **启动 WebUI**。
3. **Probe**：上传插件，验证元数据。
4. **安装**。
5. **配置**：创建应用 (App)，选择插件，配置参数。
6. **启用**：启动应用。
7. **观测**：查看数据流向和日志。

### 9.2 发布与兼容性清单

- **多平台产物**。
- **Probe 通过**。
- **版本管理**。

## 10. 常见问题

- **Q: 数据发不出去？**
  - A: 检查网络配置，检查队列是否已满。
- **Q: 插件崩溃？**
  - A: 检查是否有 panic，是否处理了所有 Result。

## 11. 关键demo代码详解

*(此处可粘贴内置插件如 Kafka 的关键代码片段，例如批量发送的实现、背压控制逻辑等)*
