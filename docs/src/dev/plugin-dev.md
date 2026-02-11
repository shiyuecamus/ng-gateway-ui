---
title: 北向插件开发
description: 以 MQTT 为 Demo，按 1、2、3... 的步骤讲清楚如何在 NG Gateway 中从 0 到 1 开发一个可上线的生产级北向插件：接口契约、配置/元数据、背压与队列、超时与重试、可观测性、测试与发布。
---

# 北向插件开发

本章面向 **插件开发者**，目标是让你能按步骤完成一个 **生产级** 的北向插件（Northward Plugin）：

- **能被网关动态加载**：以 `cdylib` 形式发布，满足 ABI/版本/平台约束
- **能被 UI 自动建模**：通过 Plugin Metadata Schema 自动渲染配置表单
- **能跑得稳/跑得快**：高吞吐、低延迟、下游抖动可控、弱网容错、可观测、可排障

---

## 0. 前置条件与硬性约束

### 0.1 关键概念

在 NG Gateway 中，“北向插件”不是一个简单的 HTTP/Kafka/MQTT 客户端，而是一个 **按 App 隔离的、被网关托管生命周期** 的组件。

#### 0.1.1 Host 与 Plugin 的职责边界

- **网关侧 - Host 负责**：
  - 动态加载插件库：`./plugins/builtin` 与 `./plugins/custom`
  - Probe 探测：OS/Arch、checksum、SDK/API 版本、静态元数据（UI Schema）
  - 统一日志桥接与动态日志级别治理（全局/按 App 的 override）
  - 给每个 App 创建隔离 runtime（队列、buffer、metrics、span），并把 `NorthwardData` 按背压策略投递给插件
  - 管理连接与重试（由 SDK 的 supervision loop 统一治理）

- **插件侧 - Plugin `cdylib` 负责**：
  - 把 `NorthwardData` 编码/映射成平台 payload（JSON/Protobuf/自定义）
  - 可选：消费平台下行消息，并通过 `NorthwardEvent` 把业务事件发回网关（写点/命令/RPC）

::: tip `NorthwardData` vs `NorthwardEvent`

- **`NorthwardData`（Gateway → Plugin）**：上行数据面，包含 Telemetry/Attributes/设备上下线等。
- **`NorthwardEvent`（Plugin → Gateway）**：下行业务事件，包含 WritePoint/Command/RPC Response 等，插件通过 `events_tx` 发回网关，由网关负责路由到南向。

:::

#### 0.1.2两层背压

数据从网关到插件至少会经过两层有界队列：

- **Host → Plugin（per-app）队列**：由网关的 `QueuePolicy.capacity` 等策略控制（面向系统稳定性）
- **Plugin actor mailbox**：由 `ng_plugin_factory!(..., channel_capacity=...)` 控制（面向插件自身吞吐/延迟折中）

再往下，生产级插件通常还会引入：

- **Handle → I/O worker** 的“内部出站队列”（必须有界），让 `process_data()` 保持 CPU-only，不在 AppActor 热路径做 I/O

---

### 0.2 你需要准备什么

- **Rust stable 工具链**
- **网关本地环境**：参考 [`本地开发`](/dev/local-dev) 启动后端与 WebUI
- **下游平台环境**：本章 demo 使用 MQTT Broker（推荐 MQTT v5），你可以用：
  - 本地 Broker：`mosquitto` / `emqx`（Docker 或本机安装均可）
  - 你们平台的 MQTT 接入点（公网/内网）做联调与压测（建议先在沙箱环境验证）

---

### 0.3 硬性约束

::: warning 必须遵守的契约
1. **`metadata_fn` 必须纯**：不得读文件、环境变量或网络。
2. **`Connector::new(ctx)` 必须同步且无 I/O**：所有网络/文件/阻塞 I/O 必须放在 `connect()` / `init()` / `run()` 中。
3. **热路径（`NorthwardHandle::process_data`）禁止阻塞**：不得同步 I/O，不得长时间持锁，不得无限制 spawn 任务。
4. **严禁 `unwrap()` / `expect()`**：生产级代码必须处理所有错误，返回 `Result` 并携带上下文。
5. **队列必须有界**：任何用于缓冲数据的 channel/queue 必须 bounded，并明确满了之后的策略（拒绝/丢弃/合并）。
6. **日志不能泄密**：token/密码/证书/私钥不得进入日志、错误字符串、Debug 输出。
:::

---

## 1. 创建插件 crate

在开始编写代码前，先创建一个新的插件 crate（建议以 `ng-plugin-` 作为前缀）。

```bash
cargo new --lib ng-plugin-mqtt
cd ng-plugin-mqtt
```

### 1.1 Cargo.toml 最小约束

建议在独立仓库创建插件 crate；如果在本仓库内开发，命名建议遵循 `ng-plugin-xxx`，便于 `cargo xtask deploy` 自动部署到 `plugins/builtin`。

```toml
[package]
name = "ng-plugin-mqtt"
version = "0.1.0"
edition = "2021"
publish = false

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
ng-gateway-sdk = "0.1"
tokio = { version = "1", features = ["full", "tracing"] }
async-trait = "0.1"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
tracing = "0.1"
bytes = "1"

# Demo: MQTT client
# NOTE:
# - Prefer an async client that supports MQTT v5 properties and stable reconnect behavior.
# - Keep the dependency surface minimal; avoid heavy runtime duplications.
rumqttc = { version = "0.25", default-features = false, features = ["use-rustls"] }
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
ng-plugin-mqtt/
  Cargo.toml
  src/
    lib.rs         // 导出 factory（宏）
    config.rs      // 运行时强类型配置（serde）
    metadata.rs    // UI Schema（纯静态）
    converter.rs   // JSON -> 强类型配置（低频路径）
    connector.rs   // Connector：new/connect/classify_error
    session.rs     // Session：init/run（attempt 生命周期）
    handle.rs      // Handle：process_data 热路径（CPU-only）
    codec.rs       // (可选) 编码/压缩/签名等纯函数
```

### 2.2 工程模块边界

- **导出层（`lib.rs`）**：只做 `ng_plugin_factory!` 宏调用，不放业务逻辑。
- **配置层（`config.rs`）**：强类型配置（serde），确保向后兼容（新增字段有默认值）。
- **Schema 层（`metadata.rs`）**：UI Schema（纯静态），严禁 I/O，严禁依赖运行时状态。
- **模型转换层（`converter.rs`）**：`serde_json::Value` → `Arc<dyn PluginConfig>`，仅做解析/校验/归一化（低频路径）。
- **连接层（`connector.rs`、`session.rs`）**：attempt 生命周期（connect/init/run）、重试与取消、资源边界与清理。
- **热路径层（`handle.rs`）**：`process_data()` 必须 CPU-only + 可背压（`try_send` 到内部 worker 队列）。
- **下行事件层（建议放在 `session.rs`）**：平台下行消息的消费/订阅属于 **I/O + 长循环**，应由 `Session::run()` 启动 worker 负责，并在 worker 中把 payload 解码成 `NorthwardEvent` 后通过 `events_tx` 发回网关（由网关路由到南向）。不要把下行消费或 `events_tx.send().await` 放进 `handle.rs` 的热路径里。
- **纯函数工具层（`codec.rs`）**：编码/压缩/签名等“可测试的纯函数”，避免污染热路径与连接层。

---

## 3. 配置及 Schema

北向插件配置典型包含：

- **连接与鉴权**：endpoint、TLS、token、用户名密码、超时
- **上行映射**：按事件类型（Telemetry/Attributes/...）配置 topic 与 payload
- **下行订阅（可选）**：订阅 topic，解码平台消息为 `NorthwardEvent` 并发回网关

::: tip 配置设计的生产级建议

- **向后兼容**：新增字段必须提供默认值（`#[serde(default)]` 或 `default_fn`）
- **敏感字段**：token/密码必须在代码层面做到 “不打印、不 debug、不拼接到 error message”
- **限幅**：对 `capacity/max_inflight` 等风险字段做 clamp（防止配置把系统打爆）

:::

### 3.1 `config.rs/types.rs` - 运行时配置

定义强类型的配置结构，用于运行时逻辑。

:::details `config.rs`

```rust
//! Plugin configuration for the MQTT northward plugin.
//!
//! This module defines strongly-typed config structs that are:
//! - `Serialize`/`Deserialize` (UI submits JSON)
//! - downcastable via `PluginConfig`
//! - stable and backward compatible across versions

use ng_gateway_sdk::PluginConfig;
use serde::{Deserialize, Serialize};

// Re-export SDK payload config types for consistency across plugins.
pub use ng_gateway_sdk::northward::payload::UplinkPayloadConfig;

/// MQTT plugin configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MqttPluginConfig {
    /// Connection settings for the MQTT broker.
    pub connection: MqttConnectionConfig,

    /// Uplink mappings (Gateway -> MQTT), by `NorthwardData` kind.
    #[serde(default)]
    pub uplink: UplinkConfig,

    /// Downlink settings (MQTT -> Gateway), optional.
    #[serde(default)]
    pub downlink: DownlinkConfig,
}

impl PluginConfig for MqttPluginConfig {}

/// MQTT connection config.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MqttConnectionConfig {
    /// MQTT broker address.
    ///
    /// Examples:
    /// - `mqtt://127.0.0.1:1883`
    /// - `mqtts://broker.example.com:8883`
    pub broker: String,

    /// MQTT client ID.
    ///
    /// IMPORTANT: keep it stable per App to avoid frequent session resets.
    pub client_id: String,

    /// Optional username/password (DO NOT log these).
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub password: Option<String>,

    /// Keep alive in seconds.
    #[serde(default = "MqttConnectionConfig::default_keep_alive_sec")]
    pub keep_alive_sec: u16,

    /// Max in-flight publishes in the uplink worker (internal concurrency cap).
    #[serde(default = "MqttConnectionConfig::default_max_inflight")]
    pub max_inflight: usize,
}

impl MqttConnectionConfig {
    #[inline]
    fn default_keep_alive_sec() -> u16 {
        30
    }

    #[inline]
    fn default_max_inflight() -> usize {
        1024
    }
}

/// Uplink mapping configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UplinkConfig {
    /// Master switch for uplink.
    #[serde(default = "UplinkConfig::default_enabled")]
    pub enabled: bool,

    /// Topic to publish uplink data to.
    ///
    /// Production recommendation:
    /// - Keep topics low-cardinality (avoid point/value in the topic).
    /// - Put high-cardinality info into the payload.
    ///
    /// Example: `ng/v1/{{app_name}}/uplink`
    #[serde(default = "UplinkConfig::default_topic")]
    pub topic: String,

    /// Internal bounded outbound queue capacity (handle -> publisher worker).
    ///
    /// This is a short burst buffer; do not set it to huge values blindly.
    #[serde(default = "UplinkConfig::default_outbound_queue_capacity")]
    pub outbound_queue_capacity: usize,

    /// Payload encoding mode for different event kinds.
    ///
    /// For production, keep a stable schema and version your payloads.
    #[serde(default)]
    pub payload: UplinkPayloadConfig,

    /// MQTT QoS level for uplink publish.
    ///
    /// Values: 0/1/2. Prefer QoS 1 for most IoT uplink.
    #[serde(default = "UplinkConfig::default_qos")]
    pub qos: u8,
}

impl Default for UplinkConfig {
    fn default() -> Self {
        Self {
            enabled: UplinkConfig::default_enabled(),
            topic: UplinkConfig::default_topic(),
            outbound_queue_capacity: UplinkConfig::default_outbound_queue_capacity(),
            payload: UplinkPayloadConfig::default(),
            qos: UplinkConfig::default_qos(),
        }
    }
}

impl UplinkConfig {
    #[inline]
    fn default_enabled() -> bool {
        true
    }

    #[inline]
    fn default_topic() -> String {
        "ng/v1/{{app_name}}/uplink".to_string()
    }

    #[inline]
    fn default_outbound_queue_capacity() -> usize {
        1024
    }

    #[inline]
    fn default_qos() -> u8 {
        1
    }
}

/// Downlink configuration (optional).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownlinkConfig {
    /// Master switch for downlink subscription.
    #[serde(default)]
    pub enabled: bool,

    /// Subscribed topic filters to receive downlink commands.
    ///
    /// Example: `ng/v1/{{app_name}}/downlink/#`
    #[serde(default)]
    pub topic_filters: Vec<String>,
}

impl Default for DownlinkConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            topic_filters: vec!["ng/v1/{{app_name}}/downlink/#".to_string()],
        }
    }
}
```

:::

---

### 3.2 `metadata.rs` - UI/Excel Schema

插件安装/Probe 时，网关会读取插件导出的 **静态元数据**（JSON bytes）。UI 用它渲染表单并做前置校验。

::: details `metadata.rs`

```rust
//! Static plugin metadata schema for UI-driven configuration.
//!
//! IMPORTANT:
//! - This must be pure and deterministic.
//! - Do NOT read env/files/network here.
//! - Do NOT perform allocations in hot loops; this runs at probe time only.

use ng_gateway_sdk::{
    ui_text, Field, Group, Node, PluginConfigSchemas, RuleValue, Rules, UiDataType, UiProps,
};
use serde_json::json;

/// Build static metadata once to be embedded as JSON for the gateway UI/config.
pub(super) fn build_metadata() -> PluginConfigSchemas {
    vec![build_connection_group(), build_uplink_group()]
}

fn build_connection_group() -> Node {
    Node::Group(Group {
        id: "connection".into(),
        label: ui_text!(en = "Connection", zh = "连接"),
        description: None,
        collapsible: false,
        order: Some(1),
        children: vec![
            Node::Field(Box::new(Field {
                path: "connection.broker".into(),
                label: ui_text!(en = "MQTT Broker", zh = "MQTT Broker"),
                data_type: UiDataType::String,
                default_value: Some(json!("mqtt://127.0.0.1:1883")),
                order: Some(1),
                ui: Some(UiProps {
                    help: Some(ui_text!(
                        en = "MQTT broker address for uplink/downlink.",
                        zh = "用于上行/下行的 MQTT Broker 地址。"
                    )),
                    ..Default::default()
                }),
                rules: Some(Rules {
                    required: Some(RuleValue::Value(true)),
                    min_length: Some(RuleValue::Value(1)),
                    ..Default::default()
                }),
                when: None,
            })),
            Node::Field(Box::new(Field {
                path: "connection.clientId".into(),
                label: ui_text!(en = "Client ID", zh = "Client ID"),
                data_type: UiDataType::String,
                default_value: Some(json!("ng-{{app_name}}")),
                order: Some(2),
                ui: Some(UiProps {
                    help: Some(ui_text!(
                        en = "Stable client ID per App is recommended (avoid frequent session resets).",
                        zh = "建议每个 App 使用稳定的 client_id，避免会话频繁重置。"
                    )),
                    ..Default::default()
                }),
                rules: Some(Rules {
                    required: Some(RuleValue::Value(true)),
                    min_length: Some(RuleValue::Value(1)),
                    ..Default::default()
                }),
                when: None,
            })),
            Node::Field(Box::new(Field {
                path: "connection.keepAliveSec".into(),
                label: ui_text!(en = "Keep Alive (sec)", zh = "Keep Alive(秒)"),
                data_type: UiDataType::Integer,
                default_value: Some(json!(30)),
                order: Some(3),
                ui: None,
                rules: Some(Rules {
                    required: Some(RuleValue::Value(true)),
                    min: Some(RuleValue::Value(1.0)),
                    ..Default::default()
                }),
                when: None,
            })),
            Node::Field(Box::new(Field {
                path: "connection.username".into(),
                label: ui_text!(en = "Username", zh = "用户名"),
                data_type: UiDataType::String,
                default_value: None,
                order: Some(4),
                ui: Some(UiProps {
                    help: Some(ui_text!(
                        en = "Optional. Do not put secrets into logs.",
                        zh = "可选。请勿在日志中输出敏感信息。"
                    )),
                    ..Default::default()
                }),
                rules: None,
                when: None,
            })),
            Node::Field(Box::new(Field {
                path: "connection.password".into(),
                label: ui_text!(en = "Password", zh = "密码"),
                data_type: UiDataType::String,
                default_value: None,
                order: Some(5),
                ui: Some(UiProps {
                    help: Some(ui_text!(
                        en = "Optional. Do not put secrets into logs.",
                        zh = "可选。请勿在日志中输出敏感信息。"
                    )),
                    ..Default::default()
                }),
                rules: None,
                when: None,
            })),
            Node::Field(Box::new(Field {
                path: "connection.maxInflight".into(),
                label: ui_text!(en = "Max Inflight Publishes", zh = "最大并发 Publish"),
                data_type: UiDataType::Integer,
                default_value: Some(json!(1024)),
                order: Some(6),
                ui: Some(UiProps {
                    help: Some(ui_text!(
                        en = "Caps concurrent publish operations in the uplink worker.",
                        zh = "限制 uplink worker 的并发 publish 数。"
                    )),
                    ..Default::default()
                }),
                rules: Some(Rules {
                    required: Some(RuleValue::Value(true)),
                    min: Some(RuleValue::Value(1.0)),
                    max: Some(RuleValue::Value(4096.0)),
                    ..Default::default()
                }),
                when: None,
            })),
        ],
    })
}

fn build_uplink_group() -> Node {
    Node::Group(Group {
        id: "uplink".into(),
        label: ui_text!(en = "Uplink", zh = "上行"),
        description: Some(ui_text!(
            en = "Gateway -> MQTT payload encoding and topic.",
            zh = "Gateway -> MQTT 的 payload 编码方式与 topic。"
        )),
        collapsible: false,
        order: Some(2),
        children: vec![
            Node::Field(Box::new(Field {
                path: "uplink.enabled".into(),
                label: ui_text!(en = "Enabled", zh = "启用"),
                data_type: UiDataType::Boolean,
                default_value: Some(json!(true)),
                order: Some(1),
                ui: None,
                rules: Some(Rules {
                    required: Some(RuleValue::Value(true)),
                    ..Default::default()
                }),
                when: None,
            })),
            Node::Field(Box::new(Field {
                path: "uplink.topic".into(),
                label: ui_text!(en = "Topic", zh = "Topic"),
                data_type: UiDataType::String,
                default_value: Some(json!("ng/v1/{{app_name}}/uplink")),
                order: Some(2),
                ui: Some(UiProps {
                    help: Some(ui_text!(
                        en = "Prefer low-cardinality topics. Put high-cardinality info into payload.",
                        zh = "建议使用低基数 topic，高基数信息放到 payload。"
                    )),
                    ..Default::default()
                }),
                rules: Some(Rules {
                    required: Some(RuleValue::Value(true)),
                    min_length: Some(RuleValue::Value(1)),
                    ..Default::default()
                }),
                when: None,
            })),
            Node::Field(Box::new(Field {
                path: "uplink.outboundQueueCapacity".into(),
                label: ui_text!(en = "Outbound Queue Capacity", zh = "出站队列容量"),
                data_type: UiDataType::Integer,
                default_value: Some(json!(1024)),
                order: Some(3),
                ui: Some(UiProps {
                    help: Some(ui_text!(
                        en = "Bounded queue capacity (handle -> publisher worker).",
                        zh = "有界队列容量（handle -> publisher worker）。"
                    )),
                    ..Default::default()
                }),
                rules: Some(Rules {
                    required: Some(RuleValue::Value(true)),
                    min: Some(RuleValue::Value(1.0)),
                    max: Some(RuleValue::Value(10_000_000.0)),
                    ..Default::default()
                }),
                when: None,
            })),
            // Payload config schema is shared in SDK; for a full plugin you typically
            // expose UplinkPayloadConfig fields here (envelope_json / mapped_json / kv / ...).
            //
            // For simplicity, this demo keeps it default-only. See built-in plugins:
            // - ng-gateway-northward/kafka/src/metadata.rs
            // - ng-gateway-northward/pulsar/src/metadata.rs
        ],
    })
}
```

:::

::: warning Schema 设计要点

- **字段路径 (path)**：必须与 `config.rs`/`types.rs` 中的 serde 字段名一致。
- **校验前置**：利用 `Rules` (min, max, pattern, required) 在 UI 层拦截错误。
- **默认值**：为非必填项提供合理的 `default_value`。
- **国际化**：使用 `ui_text!` 宏提供中英文对照。

:::

---

## 4. 实现 Model Convert

插件库导出的工厂需要能把 UI 提交的 JSON 配置转成可 downcast 的强类型对象 `Arc<dyn PluginConfig>`。  
::: tip `职责`
- 解析/归一化配置（trim 字符串、空字符串→None、默认值补齐、字段名兼容等）
- 前置校验（必填项、范围约束：keep_alive、capacity、max_inflight、broker/topic 合法性）
- 预编译/预校验表达式（例如 `mapped_json` 的 JMESPath 表达式在这里编译一次，避免把失败拖到运行期）
- 限幅与防爆（对 `capacity/max_inflight` 这类资源上限字段做 clamp，避免配置把网关/下游打爆）

> 这样可以显著降低热路径（`process_data`）的 CPU 与分配开销，并把错误尽早暴露在“保存配置/启用插件”阶段
:::

::: details `converter.rs`

```rust
//! Model conversion implementation for MQTT plugin (low-frequency path).
//!
//! Converts UI JSON config into a typed `PluginConfig`.
//! This MUST be deterministic and MUST NOT perform any network or blocking I/O.

use crate::config::MqttPluginConfig;
use ng_gateway_sdk::{
    mapping::{CompiledMappedJson, MappedJsonSpec},
    northward::payload::UplinkPayloadConfig,
    supervision::converter::NorthwardModelConverter,
    NorthwardError, NorthwardResult, PluginConfig,
};
use std::sync::Arc;

#[derive(Debug, Clone, Default)]
pub struct MqttConverter;

impl NorthwardModelConverter for MqttConverter {
    fn convert_plugin_config(
        &self,
        config: serde_json::Value,
    ) -> NorthwardResult<Arc<dyn PluginConfig>> {
        let mut cfg: MqttPluginConfig =
            serde_json::from_value(config).map_err(|e| NorthwardError::SerializationError {
                reason: e.to_string(),
            })?;

        // 1) Normalize strings (deterministic, no I/O).
        cfg.connection.broker = cfg.connection.broker.trim().to_string();
        cfg.connection.client_id = cfg.connection.client_id.trim().to_string();
        cfg.connection.username = normalize_secret_opt(cfg.connection.username);
        cfg.connection.password = normalize_secret_opt(cfg.connection.password);

        cfg.uplink.topic = cfg.uplink.topic.trim().to_string();

        cfg.downlink.topic_filters = cfg
            .downlink
            .topic_filters
            .into_iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        // 2) Validate required fields.
        if cfg.connection.broker.is_empty() {
            return Err(NorthwardError::ConfigurationError {
                message: "connection.broker is required".to_string(),
            });
        }
        if cfg.connection.client_id.is_empty() {
            return Err(NorthwardError::ConfigurationError {
                message: "connection.clientId is required".to_string(),
            });
        }
        if cfg.uplink.enabled && cfg.uplink.topic.is_empty() {
            return Err(NorthwardError::ConfigurationError {
                message: "uplink.topic is required when uplink.enabled=true".to_string(),
            });
        }
        if cfg.downlink.enabled && cfg.downlink.topic_filters.is_empty() {
            return Err(NorthwardError::ConfigurationError {
                message: "downlink.topicFilters is required when downlink.enabled=true".to_string(),
            });
        }

        // 3) Clamp risk fields (avoid accidental resource blow-up).
        // NOTE: bounds should be conservative and documented.
        cfg.connection.keep_alive_sec = cfg.connection.keep_alive_sec.max(1).min(3600);
        cfg.connection.max_inflight = cfg.connection.max_inflight.max(1).min(4096);
        cfg.uplink.outbound_queue_capacity =
            cfg.uplink.outbound_queue_capacity.clamp(1, 1_000_000);
        cfg.uplink.qos = cfg.uplink.qos.min(2);

        // 4) Validate payload config.
        // For `mapped_json`, compile expressions once to catch errors early.
        validate_uplink_payload(&cfg.uplink.payload)?;

        Ok(Arc::new(cfg))
    }
}

/// Normalize an optional secret string:
/// - trim whitespace
/// - treat empty/blank as None
///
/// IMPORTANT: never log the returned value.
fn normalize_secret_opt(v: Option<String>) -> Option<String> {
    let s = v?;
    let t = s.trim();
    if t.is_empty() {
        None
    } else {
        Some(t.to_string())
    }
}

/// Validate uplink payload config (pure).
fn validate_uplink_payload(payload: &UplinkPayloadConfig) -> NorthwardResult<()> {
    match payload {
        UplinkPayloadConfig::EnvelopeJson => Ok(()),
        UplinkPayloadConfig::Kv { .. } => Ok(()),
        UplinkPayloadConfig::TimeseriesRows { .. } => Ok(()),
        UplinkPayloadConfig::MappedJson { config } => {
            if config.is_empty() {
                return Err(NorthwardError::ConfigurationError {
                    message: "uplink.payload.config must not be empty for mapped_json".to_string(),
                });
            }

            let spec = MappedJsonSpec::from(config.clone());
            CompiledMappedJson::compile(&spec).map_err(|e| NorthwardError::ConfigurationError {
                message: format!("mapped_json compile failed: {e}"),
            })?;
            Ok(())
        }
    }
}
```

:::

---

## 5. 实现 Connector / Session / Handle

### 5.1 Connector

#### 5.1.1 Connector 职责、生产级建议

::: tip `职责`

- `new(ctx)`：捕获依赖 + downcast 强类型配置 + 纯校验/归一化（无 I/O）
- `connect(ctx)`：创建 attempt-scoped 的 `Session`（允许 I/O）
- `classify_error(phase, err)`：把错误分成 Retryable vs Fatal，避免重试风暴或误判致死

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
//! MQTT supervised connector implementation.
//!
//! Connector responsibilities:
//! - `new(ctx)`: capture deps, validate config (no I/O)
//! - `connect(ctx)`: create session (may perform I/O)
//! - `classify_error`: tell supervisor whether to retry

use crate::{
    config::MqttPluginConfig,
    handle::MqttHandle,
    session::{MqttSession, MqttSessionArgs},
};
use ng_gateway_sdk::{
    northward::template::render_template_serde,
    supervision::{Connector, FailureKind, FailurePhase, Session, SessionContext},
    NorthwardError, NorthwardEvent, NorthwardInitContext, NorthwardResult,
};
use rumqttc::{AsyncClient, EventLoop, MqttOptions, Transport};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::warn;

#[derive(Clone)]
pub struct MqttConnector {
    config: Arc<MqttPluginConfig>,
    app_id: i32,
    app_name: Arc<str>,
    runtime: Arc<dyn ng_gateway_sdk::NorthwardRuntimeApi>,
    events_tx: mpsc::Sender<NorthwardEvent>,
    handle: Arc<MqttHandle>,
}

impl MqttConnector {
    /// Construct from init context (no I/O).
    pub fn from_init(ctx: NorthwardInitContext) -> NorthwardResult<Self> {
        let app_name: Arc<str> = Arc::<str>::from(ctx.app_name);
        let config = ctx
            .config
            .downcast_arc::<MqttPluginConfig>()
            .map_err(|_| NorthwardError::ConfigurationError {
                message: "Failed to downcast to MqttPluginConfig".to_string(),
            })?;

        // Minimal validation (pure, deterministic).
        if config.connection.broker.trim().is_empty() {
            return Err(NorthwardError::ConfigurationError {
                message: "connection.broker is required".to_string(),
            });
        }
        if config.connection.client_id.trim().is_empty() {
            return Err(NorthwardError::ConfigurationError {
                message: "connection.clientId is required".to_string(),
            });
        }

        Ok(Self {
            config,
            app_id: ctx.app_id,
            app_name: Arc::clone(&app_name),
            runtime: ctx.runtime,
            events_tx: ctx.events_tx,
            handle: Arc::new(MqttHandle::new(
                Arc::clone(&config),
                ctx.app_id,
                app_name,
                Arc::clone(&ctx.runtime),
            )),
        })
    }
}

/// Build MQTT options from plugin config (low-frequency path).
///
/// IMPORTANT:
/// - This is control-plane code; it may allocate, but must not perform blocking I/O.
/// - For production-grade `mqtts://`, configure TLS explicitly (CA / client auth).
fn build_mqtt_options(
    conn: &crate::config::MqttConnectionConfig,
    app_name: &Arc<str>,
) -> NorthwardResult<MqttOptions> {
    // Allow `mqtt://host:port` or `host:port`. Keep parsing deterministic.
    let addr = conn
        .broker
        .trim()
        .trim_start_matches("mqtt://")
        .trim_start_matches("mqtts://");

    let mut parts = addr.split(':');
    let host = parts.next().unwrap_or("127.0.0.1");
    let port: u16 = parts
        .next()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(1883);

    // Render client_id as a template so one config can be reused across Apps.
    // Template syntax: Handlebars, same as `ng_gateway_sdk::northward::template`.
    //
    // NOTE: We intentionally build an owned JSON context here (low-frequency path),
    // avoiding lifetime-heavy `Ctx<'a>` patterns.
    let tpl = json!({
        "app_name": app_name.to_string(),
    });
    let client_id = render_template_serde(conn.client_id.as_str(), &tpl);

    if client_id.trim().is_empty() {
        return Err(NorthwardError::ConfigurationError {
            message: "connection.clientId rendered to empty string".to_string(),
        });
    }

    let mut opts = MqttOptions::new(client_id, host, port);
    opts.set_keep_alive(std::time::Duration::from_secs(u64::from(
        conn.keep_alive_sec.max(1),
    )));

    if let Some(u) = conn.username.as_deref() {
        // IMPORTANT: never log credentials.
        let p = conn.password.clone().unwrap_or_default();
        opts.set_credentials(u, p);
    }

    // Demo: always use TCP transport here.
    //
    // Production: if `mqtts://` is used, configure TLS, e.g.:
    // opts.set_transport(Transport::Tls(TlsConfiguration::Simple { ca, alpn, client_auth }));
    opts.set_transport(Transport::Tcp);

    Ok(opts)
}

#[async_trait::async_trait]
impl Connector for MqttConnector {
    type InitContext = NorthwardInitContext;
    type Handle = MqttHandle;
    type Session = MqttSession;

    fn new(ctx: Self::InitContext) -> Result<Self, <Self::Session as Session>::Error> {
        Self::from_init(ctx)
    }

    async fn connect(
        &self,
        _ctx: SessionContext,
    ) -> Result<Self::Session, <Self::Session as Session>::Error> {
        // Attempt-scoped bounded queue for send-path side effects.
        let cap = self.config.uplink.outbound_queue_capacity.max(1);
        let (outbound_tx, outbound_rx) = mpsc::channel(cap);

        // Attempt-scoped MQTT client + event loop.
        //
        // NOTE: the actual socket connect is driven by `event_loop.poll()` in `Session::init/run`.
        let opts = build_mqtt_options(&self.config.connection, &self.app_name)?;
        let request_cap = self.config.connection.max_inflight.max(1).min(4096);
        let (client, event_loop): (AsyncClient, EventLoop) = AsyncClient::new(opts, request_cap);

        Ok(MqttSession::new(MqttSessionArgs {
            handle: Arc::clone(&self.handle),
            outbound_rx,
            outbound_tx: Some(outbound_tx),
            client,
            event_loop,
            uplink: self.config.uplink.clone(),
            downlink: self.config.downlink.clone(),
            uplink_qos: self.config.uplink.qos.min(2),
            app_id: self.app_id,
            app_name: Arc::clone(&self.app_name),
            events_tx: self.events_tx.clone(),
        }))
    }

    fn classify_error(
        &self,
        _phase: FailurePhase,
        err: &<Self::Session as Session>::Error,
    ) -> FailureKind {
        match err {
            NorthwardError::ConfigurationError { .. } => FailureKind::Fatal,
            other => {
                // Keep it conservative: treat runtime / IO failures as retryable.
                warn!(app_id = self.app_id, error = %other, "mqtt plugin error classified as retryable");
                FailureKind::Retryable
            }
        }
    }
}
```

:::

::: details `ExtensionStore` 与 `Provisioning`

`NorthwardInitContext` 提供 `extension_store`（host-owned 持久化 KV），用于“插件需要持久化但不应写本地文件”的场景：

- 平台 provision 后拿到的 credentials（token/密钥/证书摘要）
- 下游分配的 client_id / tenant_id
- 连接自恢复所需的少量状态（注意大小与隐私）

最佳实践：

- **读取/写入只在控制面**：放在 `connect()` 或 `init()`（低频），不要放在 `process_data()` 热路径。
- **写入要幂等**：避免并发重复 provision。
- **不记录 secret**：日志只打印“是否存在/是否更新”，不要打印内容。

参考实现：`ng-gateway-northward/thingsboard/src/connector.rs` 的 provision 流程。

:::

### 5.2 Session

> `Session` 表示“一次 attempt（连接尝试）成功创建后的生命周期”

#### 5.2.1 Session 职责、生产级建议

::: tip `职责`
- `handle()`：返回 `Arc<Handle>`（数据面热路径接口）
- `init(&ctx)`：定义 Ready 边界（短平快、可控超时）
- `run(ctx)`：
  - 启动 `attempt-scoped I/O worker`，驱动直到断开/取消/请求重连
  - **下行订阅/消费、消息解码为 `NorthwardEvent`，以及通过 `events_tx` 转发回网关也应放在这里**
:::

::: warning 生产级建议
- `init()` 里做“短平快”的握手校验（超时可控），不要把长循环塞进 `init()`
- `run()` 里使用 `tokio::select!` 同时处理：
  - cancel（优雅退出）
  - 心跳/保活
  - 上行/下行任务的 join
  - 监听内部“请求重连”信号：当协议层检测到不可恢复的 transport 异常/长时间超时，调用 `ctx.reconnect.try_request_reconnect(reason)` 触发监督循环重连（**不 await**）
- 对 CONNACK / SUBACK / PUBACK 等 reason code 做更精确分类（哪些应重试，哪些应当 Fatal）
- 对 publish/subscribe 失败实现可控重试（有限次数 + jitter），避免重试风暴
- 批量/压缩（减少带宽与连接开销）
- 幂等键（防止下游重复消费）
:::

::: details `生命周期语义速查`

- `Connector::new(ctx)`
  - **做什么**：捕获依赖（`app_id/app_name/runtime/events_tx/retry_policy/extension_store` 等），downcast 强类型配置，做纯校验/归一化。
  - **必须**：同步、无 I/O、无阻塞；失败应返回 `ConfigurationError`（可诊断）。
  - **不要**：spawn 长任务；不要做网络/文件 I/O；不要在这里做“不可控耗时”的探测。

- `Connector::connect(ctx)`
  - **做什么**：创建 attempt-scoped 的 `Session`（允许 I/O，如创建 client/producer、建立连接、做轻量 probe）。
  - **必须**：尊重 `ctx.cancel`；所有 I/O 有超时；把“attempt 级资源”限定在 `Session` 生命周期内。
  - **不要**：在这里做无限循环（应该放到 `Session::run`）；不要创建无取消的后台任务。

- `Session::init(&ctx)`
  - **做什么**：定义 Ready 边界（例如：鉴权校验、订阅建立、路由表预编译、把必要依赖注入 handle）。
  - **必须**：短平快、可控超时；失败语义清晰（auth/config/protocol）。

- `Session::run(ctx)`
  - **做什么**：驱动 attempt 直到断开/取消/请求重连；在此处启动 I/O worker（上行 publisher、下行 consumer 等）。
  - **必须**：`tokio::select!` 同时处理 cancel + worker join；退出时清理资源；必要时 `ctx.reconnect.try_request_reconnect(reason)`（不 await）。

- `NorthwardHandle::process_data(data)`
  - **做什么**：热路径编码 + 路由选择 + `try_send` 到内部出站队列。
  - **必须**：CPU-only + 非阻塞；背压以错误/拒绝语义向上游传播（避免无界堆积）。

:::

::: details `session.rs`

```rust
//! MQTT supervised session implementation.
//!
//! This is an attempt-scoped lifecycle driven by SDK supervisor.
//!
//! Key ideas:
//! - `eventloop.poll()` is the single "I/O pump" that drives MQTT networking.
//! - Uplink publish is fed by a bounded queue from `Handle::process_data()` (CPU-only).
//! - Downlink is handled by subscribing topic filters and decoding incoming publishes
//!   into `NorthwardEvent`, then forwarding via `events_tx` back to the gateway.

use crate::{
    config::{DownlinkConfig, MqttConnectionConfig, UplinkConfig},
    handle::{OutboundPublish, MqttHandle},
};
use async_trait::async_trait;
use ng_gateway_sdk::{
    envelope::EnvelopeKind,
    northward::codec::decode_downlink_envelope,
    northward::template::render_template_serde,
    supervision::{RunOutcome, Session, SessionContext},
    NorthwardError, NorthwardEvent,
};
use rumqttc::{Event, EventLoop, Packet, QoS, SubscribeFilter};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{debug, warn};

pub struct MqttSession {
    handle: Arc<MqttHandle>,
    outbound_rx: mpsc::Receiver<OutboundPublish>,
    outbound_tx: Option<mpsc::Sender<OutboundPublish>>,
    client: rumqttc::AsyncClient,
    event_loop: Option<EventLoop>,
    uplink: UplinkConfig,
    downlink: DownlinkConfig,
    uplink_qos: u8,
    app_id: i32,
    app_name: Arc<str>,
    events_tx: mpsc::Sender<NorthwardEvent>,
}

pub struct MqttSessionArgs {
    pub handle: Arc<MqttHandle>,
    pub outbound_rx: mpsc::Receiver<OutboundPublish>,
    pub outbound_tx: Option<mpsc::Sender<OutboundPublish>>,
    pub client: rumqttc::AsyncClient,
    pub event_loop: EventLoop,
    pub uplink: UplinkConfig,
    pub downlink: DownlinkConfig,
    pub uplink_qos: u8,
    pub app_id: i32,
    pub app_name: Arc<str>,
    pub events_tx: mpsc::Sender<NorthwardEvent>,
}

impl MqttSession {
    pub fn new(args: MqttSessionArgs) -> Self {
        Self {
            handle: args.handle,
            outbound_rx: args.outbound_rx,
            outbound_tx: args.outbound_tx,
            client: args.client,
            event_loop: Some(args.event_loop),
            uplink: args.uplink,
            downlink: args.downlink,
            uplink_qos: args.uplink_qos,
            app_id: args.app_id,
            app_name: args.app_name,
            events_tx: args.events_tx,
        }
    }
}

#[async_trait]
impl Session for MqttSession {
    type Handle = MqttHandle;
    type Error = NorthwardError;

    fn handle(&self) -> &Arc<Self::Handle> {
        &self.handle
    }

    async fn init(&mut self, ctx: &SessionContext) -> Result<(), Self::Error> {
        // Define "Ready" for this attempt:
        // - observe ConnAck (transport is established)
        // - enqueue required subscriptions (downlink is configured)
        let Some(mut ev) = self.event_loop.take() else {
            return Ok(());
        };

        loop {
            tokio::select! {
                _ = ctx.cancel.cancelled() => {
                    self.event_loop = Some(ev);
                    return Err(NorthwardError::NotConnected);
                }
                res = ev.poll() => {
                    let event = res.map_err(|e| NorthwardError::MqttError { reason: e.to_string() })?;
                    if let Event::Incoming(Packet::ConnAck(_)) = event {
                        break;
                    }
                }
            }
        }

        if self.downlink.enabled {
            // Render topic filters as templates so one config can be reused across Apps.
            let tf_ctx = json!({
                "app_name": self.app_name.to_string(),
            });
            let filters: Vec<SubscribeFilter> = self
                .downlink
                .topic_filters
                .iter()
                .map(|t| render_template_serde(t.as_str(), &tf_ctx))
                .filter(|t| !t.trim().is_empty())
                .map(|t| SubscribeFilter::new(t, QoS::AtLeastOnce))
                .collect();

            if filters.is_empty() {
                return Err(NorthwardError::ConfigurationError {
                    message: "downlink.topicFilters rendered to empty".to_string(),
                });
            }

            self.client
                .subscribe_many(filters)
                .await
                .map_err(|e| NorthwardError::MqttError {
                    reason: e.to_string(),
                })?;
        }

        // Attach attempt resources to the hot-path handle only after Ready is defined.
        self.handle.set_reconnect(ctx.reconnect.clone());
        if let Some(tx) = self.outbound_tx.take() {
            self.handle.attach_outbound(tx);
        }

        // Hand event loop back to run().
        self.event_loop = Some(ev);
        Ok(())
    }

    async fn run(mut self, ctx: SessionContext) -> Result<RunOutcome, Self::Error> {
        let reconnect = ctx.reconnect.clone();
        let app_id = self.app_id;

        let mut ev = match self.event_loop.take() {
            Some(ev) => ev,
            None => return Ok(RunOutcome::Disconnected),
        };

        let mut rx = self.outbound_rx;
        let client = self.client;
        let events_tx = self.events_tx;
        let downlink_enabled = self.downlink.enabled;
        let uplink_qos = self.uplink_qos;

        loop {
            tokio::select! {
                _ = ctx.cancel.cancelled() => break,

                maybe = rx.recv() => {
                    let Some(item) = maybe else { break; };

                    let qos = match uplink_qos {
                        0 => QoS::AtMostOnce,
                        1 => QoS::AtLeastOnce,
                        _ => QoS::ExactlyOnce,
                    };

                    if let Err(e) = client.publish(item.topic.as_str(), qos, false, item.payload).await {
                        warn!(app_id, error=%e, "mqtt publish failed");
                        let _ = reconnect.try_request_reconnect("mqtt_publish_failed");
                        return Ok(RunOutcome::ReconnectRequested(Arc::<str>::from("mqtt_publish_failed")));
                    }
                }

                res = ev.poll() => {
                    let event = match res {
                        Ok(v) => v,
                        Err(e) => {
                            warn!(app_id, error=%e, "mqtt eventloop stopped with error");
                            let _ = reconnect.try_request_reconnect("mqtt_eventloop_error");
                            return Ok(RunOutcome::ReconnectRequested(Arc::<str>::from("mqtt_eventloop_error")));
                        }
                    };

                    if !downlink_enabled {
                        continue;
                    }

                    match event {
                        Event::Incoming(Packet::Publish(p)) => {
                            match decode_downlink_envelope(p.payload.as_ref(), EnvelopeKind::WritePoint) {
                                Ok(Some(ev)) => {
                                    if let Err(e) = events_tx.send(ev).await {
                                        warn!(app_id, error=%e, "events_tx closed");
                                        let _ = reconnect.try_request_reconnect("events_tx_closed");
                                        return Ok(RunOutcome::ReconnectRequested(Arc::<str>::from("events_tx_closed")));
                                    }
                                }
                                Ok(None) => {}
                                Err(e) => {
                                    warn!(app_id, error=%e, "downlink decode failed");
                                }
                            }
                        }
                        Event::Incoming(Packet::SubAck(_)) => {
                            debug!(app_id, "mqtt subscription acknowledged");
                        }
                        _ => {}
                    }
                }
            }
        }

        // Detach attempt resources on exit so hot-path fails fast.
        self.handle.detach_outbound();
        Ok(RunOutcome::Disconnected)
    }
}
```

:::

### 5.3 Handle

#### 5.3.1 Handle 职责、生产级建议、热路径契约

::: tip `职责`

- `process_data(data)`：热路径编码 + 路由选择 + `try_send` 到内部出站队列（CPU-only）
- 背压：队列满则返回 `PublishFailed`（拒绝语义向上游传播，避免无界堆积）

:::

::: warning 生产级建议

- **不要在热路径里阻塞**：
  - 不得同步 I/O；
  - 不得 `send().await` 等待队列；避免长时间持锁或大分配
- 所有网络 I/O 都应下沉到 `Session::run()` 的 worker 循环里（集中治理、可取消、可重连）

为什么`try_send`？

因为 `process_data()` 运行在网关 AppActor 的数据面路径上。如果你在这里 `await` I/O 或者 `send().await` 等待队列可用，会把背压“放大”为整体吞吐下降与延迟抖动。

:::

::: details `handle.rs`

```rust
//! MQTT data-plane handle implementation.
//!
//! IMPORTANT:
//! - `process_data()` must be CPU-only and non-blocking.
//! - All network I/O must happen in the session worker loop.

use crate::config::MqttPluginConfig;
use arc_swap::ArcSwapOption;
use async_trait::async_trait;
use ng_gateway_sdk::{
    envelope::EnvelopeKind,
    northward::payload::{build_context_ref, encode_uplink_payload_ref, UplinkEventKind},
    northward::template::render_template_serde,
    NorthwardData, NorthwardError, NorthwardHandle, NorthwardResult,
};
use std::sync::Arc;
use tokio::sync::mpsc;

/// Internal outbound publish request (created on hot path).
#[derive(Debug, Clone)]
pub(crate) struct OutboundPublish {
    /// MQTT topic to publish to (recommended: low-cardinality).
    pub(crate) topic: String,
    pub(crate) payload: Vec<u8>,
    pub(crate) ts_ms: i64,
}

pub struct MqttHandle {
    config: Arc<MqttPluginConfig>,
    app_id: i32,
    app_name: Arc<str>,
    plugin_type: Arc<str>,
    runtime: Arc<dyn ng_gateway_sdk::NorthwardRuntimeApi>,
    outbound: ArcSwapOption<mpsc::Sender<OutboundPublish>>,
    reconnect: std::sync::OnceLock<ng_gateway_sdk::supervision::ReconnectHandle>,
}

impl MqttHandle {
    /// Create a data-plane handle that will be reused across attempts.
    ///
    /// Attempt-scoped resources (outbound sender, reconnect handle) are attached/detached
    /// by `Session::init/run`.
    pub fn new(
        config: Arc<MqttPluginConfig>,
        app_id: i32,
        app_name: Arc<str>,
        runtime: Arc<dyn ng_gateway_sdk::NorthwardRuntimeApi>,
    ) -> Self {
        Self {
            config,
            app_id,
            app_name,
            plugin_type: Arc::<str>::from("mqtt"),
            runtime,
            outbound: ArcSwapOption::from(None),
            reconnect: std::sync::OnceLock::new(),
        }
    }

    #[inline]
    pub(crate) fn set_reconnect(&self, reconnect: ng_gateway_sdk::supervision::ReconnectHandle) {
        let _ = self.reconnect.set(reconnect);
    }

    #[inline]
    pub(crate) fn attach_outbound(&self, outbound_tx: mpsc::Sender<OutboundPublish>) {
        self.outbound.store(Some(Arc::new(outbound_tx)));
    }

    #[inline]
    pub(crate) fn detach_outbound(&self) {
        self.outbound.store(None);
    }

    #[inline]
    fn load_outbound(&self) -> NorthwardResult<Arc<mpsc::Sender<OutboundPublish>>> {
        self.outbound
            .load_full()
            .ok_or(NorthwardError::NotConnected)
    }

    #[inline]
    fn try_request_reconnect(&self, reason: &'static str) {
        if let Some(h) = self.reconnect.get() {
            let _ = h.try_request_reconnect(reason);
        }
    }
}

#[async_trait]
impl NorthwardHandle for MqttHandle {
    async fn process_data(&self, data: Arc<NorthwardData>) -> NorthwardResult<()> {
        if !self.config.uplink.enabled {
            return Ok(());
        }

        let event_kind = match data.envelope_kind() {
            EnvelopeKind::DeviceConnected => UplinkEventKind::DeviceConnected,
            EnvelopeKind::DeviceDisconnected => UplinkEventKind::DeviceDisconnected,
            EnvelopeKind::Telemetry => UplinkEventKind::Telemetry,
            EnvelopeKind::Attributes => UplinkEventKind::Attributes,
            _ => return Ok(()),
        };

        // Build encoding context (contains: app/device/point meta, templates, ts, etc).
        let Some(ctx) = build_context_ref(
            self.app_id,
            &self.app_name,
            &self.plugin_type,
            event_kind,
            data.as_ref(),
            &self.runtime,
        ) else {
            return Ok(());
        };

        // Encode payload using SDK (envelope_json / kv / timeseries_rows / mapped_json).
        let payload = encode_uplink_payload_ref(&self.config.uplink.payload, &ctx, data.as_ref(), &self.runtime)
            .map_err(|e| NorthwardError::SerializationError { reason: e.to_string() })?;

        // Render topic on hot path using the same `RenderContextRef` as payload encoding.
        //
        // IMPORTANT:
        // - Keep topic templates low-cardinality; avoid putting point/value into topic.
        // - If your topic is attempt-scoped and does not depend on event/device, render it in `connect()/init()`.
        let topic = render_template_serde(self.config.uplink.topic.as_str(), &ctx);
        if topic.trim().is_empty() {
            return Err(NorthwardError::ConfigurationError {
                message: "uplink.topic rendered to empty string".to_string(),
            });
        }

        let ts_ms = ctx.ts.timestamp_millis();
        let outbound = self.load_outbound()?;

        // Never do MQTT I/O here.
        outbound
            .try_send(OutboundPublish { topic, payload, ts_ms })
            .map_err(|e| NorthwardError::PublishFailed {
                platform: "mqtt".to_string(),
                reason: format!("outbound queue rejected: {e}"),
            })
    }
}
```

:::

---

## 6. 可观测性

### 6.1 日志（tracing）最佳实践

Host 会在加载插件时：

- 调用 `ng_plugin_set_log_sink` 注册日志 sink（把插件日志汇入 host 的统一日志管线）
- 调用 `ng_plugin_init_tracing` 初始化插件侧 tracing 桥接
- （可选）调用 `ng_plugin_set_max_level` 动态调整插件最大日志级别

插件侧最佳实践：

- **结构化字段**：至少包含 `app_id`，必要时包含 `plugin_type`；避免把 device/point/value 当成字段（高基数会拖垮日志与指标系统）。
- **敏感信息脱敏**：token/密码/证书/私钥绝不输出（包括 `Debug` 打印配置、error string 拼接）。
- **热路径控制**：`debug/trace` 仅用于开发/排障，生产通常关闭；热路径（`process_data`）不要输出每条数据的 payload。
- **重连原因低基数**：`RunOutcome::ReconnectRequested(reason)` / `try_request_reconnect(reason)` 的 `reason` 必须是**稳定短句**（例如 `downstream_timeout`、`non_success_response`、`peer_task_exited`），不要把完整错误链/动态字符串塞进去（否则指标维度爆炸，且难以聚合告警）。

### 6.2 指标（Observer / Metrics）使用原则

::: tip 现状说明

- **你暂时不需要关心指标接入**：当前版本的北向 App 关键基础指标由 Host/SDK 统一采集与展示（连接治理相关信号、投递/处理的聚合统计等），插件作者无需额外对接。
- **插件内部更细粒度业务指标暂不支持对接**：例如背压 reason 分桶、下游错误 code 分类、inflight/并发 gauge 等，当前没有标准路径直接进入 Host 的 Prometheus 指标族；如需排障请暂时优先使用日志与 Realtime Monitor。

:::

### 6.3 背压与容量

生产级插件至少要回答三个问题：

- **队列满了怎么办？**（拒绝/丢弃/合并）本章模板默认：`try_send` 失败 → 返回 `PublishFailed`（把背压“显式”向上游传播）。
- **丢了多少？为什么丢？**（指标/日志要能解释；并且 reason 低基数）
- **如何调参？**（告诉用户该调 `QueuePolicy.capacity` 还是 `channel_capacity` 还是插件内部 outbound queue）

**调参对照表**

| 层级 | 参数/位置 | 作用 | 典型症状 | 推荐做法 |
|---|---|---|---|---|
| Host → Plugin（per-app）队列 | App 的 `QueuePolicy.capacity`（网关侧） | 控制“网关→插件”的投递背压边界 | app 队列 drop 增多；上行变少 | 作为系统级保护优先治理；按业务重要性选择 DropPolicy |
| Plugin actor mailbox | `ng_plugin_factory!(..., channel_capacity=...)` | 控制 RuntimeAwarePlugin 的 actor mailbox（网关→插件第二层） | 插件明显跟不上；投递失败 | 保持有界；不要盲目设很大；结合 CPU/下游能力评估 |
| Handle → I/O worker 内部队列 | `uplink.outboundQueueCapacity`（插件配置） | 保证 `process_data()` CPU-only，把 I/O 下沉到 worker | `PublishFailed: outbound queue rejected` | 插件侧最常见调参点；需配合 max_inflight 与批量策略 |
| I/O 并发上限 | `connection.maxInflight`（插件配置） | 限制 worker 同时 in-flight 的 publish | PUBACK backlog、端到端时延飙升、Broker 断连/限流 | 先限并发，再做批量/压缩；避免对 Broker 造成放大打击 |

:::: tip 经验法则
**优先保证有界 + 可解释**，其次才是“吞吐更高”。吞吐要靠批量/压缩/更低的 per-item overhead，而不是把队列无限放大。
::::

## 7. `lib.rs`：导出 ABI Factory

```rust
use connector::MqttConnector;
use converter::MqttConverter;
use metadata::build_metadata;
use ng_gateway_sdk::ng_plugin_factory;

ng_plugin_factory!(
    name = "MQTT",
    description = "MQTT northward plugin (demo template)",
    plugin_type = "mqtt",
    component = MqttConnector,
    metadata_fn = build_metadata,
    model_convert = MqttConverter,
    // Optional: tune plugin actor mailbox capacity (Gateway -> Plugin).
    // channel_capacity = 10000
);
```

---

## 8. 测试策略

### 8.1 单元测试

- codec：topic 模板解析、payload 编码（`envelope_json/kv/timeseries_rows/mapped_json`）、QoS/属性映射、非法数据容错
- planner：批量/合并算法（如有）、`max_inflight` 上限 clamp、背压策略（`try_send` 拒绝语义）、重试/退避计算（纯函数部分）
- model convert：`broker/client_id/topic_filters` 合法性、默认值、限幅 clamp、非法输入报错语义

### 8.2 集成测试

- 启动 MQTT Broker（建议容器化）
- 编写测试用例，通过 `Connector` 连接 Broker，验证：
  - 正常 publish/subscribe 路径（topic、QoS、payload）
  - 超时、断链、重连（验证 supervision attempt 的退出语义与重连原因低基数）
  - 鉴权失败/证书错误（应当 Fatal，不应无限重试）
  - 并发压力（验证背压与内存上限：Host 队列、Plugin mailbox、插件内部 outbound queue）

### 8.3 性能基准测试

仓库已有 `ng-gateway-bench`（可参考其 Modbus bench 入口）：

- codec micro-bench（每次 encode 的 ns/op）
- planner bench（点位规模扩展：1k/10k points）
- end-to-end bench（采集→MQTT publish→Broker→订阅端验证）

---

## 9. 调试与发布

### 9.1 完整流程

目标：把一个 **自定义北向插件** 通过 WebUI 完成 **上传 → Probe → Install → 绑定 App → 启用 → 北向验证** 的闭环。

1) **编译插件产物（cdylib）**

- `cargo build --release`
- 产物位于 `target/release/`（Linux `.so` / macOS `.dylib` / Windows `.dll`）

2) **WebUI 上传插件并 Probe**

- 在 WebUI 进入「插件 / Plugins」页面，上传产物
- Probe 页重点确认：
  - OS/Arch、checksum
  - `plugin_type`、`version`
  - `api_version` / `sdk_version`
  - 静态元数据（UI Schema）是否能正确渲染配置表单

3) **Install 并绑定到 App**

- 点击 Install（安装为自定义插件）
- 创建/选择一个 App，将该插件绑定到 App
- 填写最小可用配置（先跑通再扩展），并启用插件实例

4) **观测与排障（闭环的一部分）**

- 在 UI/日志中确认：
  - 插件状态与 attempt 生命周期是否稳定（是否重连、重连原因是否低基数）
  - 背压/拒绝是否可解释（`PublishFailed`、queue rejected 统计）
  - 错误分类是否正确（配置/鉴权应 Fatal，瞬时 I/O 才 Retryable）

5) **按 9.3 执行北向验证**

- uplink：订阅预期 topic，确认能收到 publish
- downlink（如启用）：向订阅 topic 发布一条命令/写点 envelope，确认网关能收到并路由

### 9.2 发布与兼容性清单

- **多平台产物**：`.so/.dylib/.dll` 且 OS/Arch 必须匹配运行环境
- **ABI/API 版本**：loader 会校验 `ng_plugin_api_version()` 与 host 一致（不一致直接拒绝）
- **SDK 版本**：不建议跨大版本混用；至少在 Probe 页确认 `sdk_version` 符合预期
- **动态依赖**：确认产物不依赖运行环境缺失的动态库（尤其是 TLS/openssl 相关）
- **配置兼容性**：
  - 新增字段必须有默认值（`serde(default)`）
  - Schema path 与配置字段保持一致、向后兼容
- **安全与合规**：
  - 用户名/密码/证书/私钥不得进入日志与 error string
  - TLS 校验默认开启（若提供“关闭校验”开关必须强提示风险）
- **Topic 与 payload 版本化**：建议使用 `ng/v1/...` 形式，并保持 topic 低基数（高基数进 payload）

### 9.3 北向验证

本节给出一个可落地的联调闭环：**用本地 Broker + 订阅端** 验证 uplink/downlink，并通过 UI/日志确认可观测性与背压语义。

#### 9.3.1 启动本地 MQTT Broker（任选其一）

使用 `mosquitto`（最轻量）：

```bash
docker run --rm -it -p 1883:1883 eclipse-mosquitto:2
```

或使用 `emqx`（更贴近生产能力）：

```bash
docker run --rm -it -p 1883:1883 -p 18083:18083 emqx/emqx:5
```

#### 9.3.2 准备订阅端

如果你有 `mosquitto_sub`：

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 -t 'ng/v1/+/uplink' -v
```

也可以用 MQTTX（GUI/CLI 均可）订阅同一 topic，便于观察 payload。

#### 9.3.3 Uplink 验证

- 在 WebUI 启用插件后，让南向驱动产生一条上行数据（Telemetry/Attributes/上下线等）
- 订阅端应能看到 publish：
  - topic：形如 `ng/v1/<app>/uplink`
  - payload：建议使用 SDK 的 `envelope_json`（稳定版本化），便于下游解析与回放

如果订阅端收不到消息，优先从 UI/日志定位：

- probe 是否通过、插件是否已启用
- outbound queue 是否持续 rejected（背压过早）
- MQTT eventloop 是否在重连（reason 低基数：`mqtt_eventloop_error` / `mqtt_publish_failed` 等）

#### 9.3.4 Downlink 验证

前提：在插件配置里启用 downlink，并订阅 `ng/v1/{{app_name}}/downlink/#`（或你自定义的 filters）。

使用 `mosquitto_pub` 发送一条“写点”类 envelope（示例为演示用途，实际字段需与你们 SDK envelope 约定一致）：

```bash
mosquitto_pub -h 127.0.0.1 -p 1883 -q 1 -t 'ng/v1/demo-app/downlink/write-point' -m '
{
  "kind": "WritePoint",
  "app": "demo-app",
  "device": "dev-1",
  "points": [{ "key": "p1", "value": 1 }]
}
'
```

验证要点：

- 插件日志应出现 downlink decode/forward 的低频信号（不要打印 payload 全量）
- 网关侧应能看到对应 `NorthwardEvent` 被路由到南向（若南向未接入，可先验证事件已到达 host）

#### 9.3.5 故障注入，验证重连与背压语义

- **断链重连**：停止 Broker 10 秒再恢复，观察 attempt 是否能重连、reason 是否低基数且可聚合
- **鉴权失败**：配置错误用户名/密码，期望 classify 为 Fatal（不要无限重试）
- **背压/内存上限**：把 `outboundQueueCapacity` 调小并制造突发流量，观察 rejected 指标与日志是否能解释“为什么丢/为什么慢”

---

## 10. 常见坑

- **在 `Connector::new()` 里做 I/O**：会破坏契约，导致启动阶段阻塞或被拒绝
- **在 `process_data()` 里做网络请求**：吞吐下降巨大，延迟抖动，且会拖垮 AppActor
- **队列无界**：短时间下游抖动会把内存打爆
- **错误分类过粗**：全 Retryable 会重试风暴；全 Fatal 会把瞬时故障当永久故障
- **日志泄密**：token/密码输出到日志等于安全事故
- **把高基数当指标 label**：device_id/point_id 放 label 会让 Prometheus 直接炸

---

## 11. 关键 Demo 代码详解

### 1) Converter：字段级约束在哪里生效？

`Converter` 是最应该“做多一点”的地方，因为它跑在低频路径（保存配置 / 启用插件 / 重新加载配置），可以承受解析与校验的成本：

- **归一化（Normalize）**：trim、空字符串→None、过滤空 topic filters，让运行期少分支、少分配
- **必填与合法性校验（Validate）**：broker/client_id/topicFilters/topic 的“空/非法”直接在配置阶段失败
- **限幅防爆（Clamp）**：`keep_alive/max_inflight/outboundQueueCapacity/qos` 做 clamp，避免配置把网关/下游打爆
- **表达式预编译（Compile once）**：`mapped_json` 在这里编译一次，避免每条消息重复编译或把错误拖到运行期

低频路径四步：反序列化→归一化→校验→限幅+预编译：

:::: details 点击展开：`关键片段`
```rust
fn convert_plugin_config(&self, config: serde_json::Value) -> NorthwardResult<Arc<dyn PluginConfig>> {
    let mut cfg: MqttPluginConfig =
        serde_json::from_value(config).map_err(|e| NorthwardError::SerializationError {
            reason: e.to_string(),
        })?;

    // 1) Normalize strings (deterministic, no I/O).
    cfg.connection.broker = cfg.connection.broker.trim().to_string();
    cfg.connection.client_id = cfg.connection.client_id.trim().to_string();
    cfg.connection.username = normalize_secret_opt(cfg.connection.username);
    cfg.connection.password = normalize_secret_opt(cfg.connection.password);
    cfg.uplink.topic = cfg.uplink.topic.trim().to_string();
    cfg.downlink.topic_filters = cfg
        .downlink
        .topic_filters
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    // 2) Validate required fields.
    if cfg.connection.broker.is_empty() {
        return Err(NorthwardError::ConfigurationError { message: "connection.broker is required".to_string() });
    }
    if cfg.connection.client_id.is_empty() {
        return Err(NorthwardError::ConfigurationError { message: "connection.clientId is required".to_string() });
    }
    if cfg.uplink.enabled && cfg.uplink.topic.is_empty() {
        return Err(NorthwardError::ConfigurationError { message: "uplink.topic is required when uplink.enabled=true".to_string() });
    }
    if cfg.downlink.enabled && cfg.downlink.topic_filters.is_empty() {
        return Err(NorthwardError::ConfigurationError { message: "downlink.topicFilters is required when downlink.enabled=true".to_string() });
    }

    // 3) Clamp risk fields (avoid accidental resource blow-up).
    cfg.connection.keep_alive_sec = cfg.connection.keep_alive_sec.max(1).min(3600);
    cfg.connection.max_inflight = cfg.connection.max_inflight.max(1).min(4096);
    cfg.uplink.outbound_queue_capacity = cfg.uplink.outbound_queue_capacity.clamp(1, 1_000_000);
    cfg.uplink.qos = cfg.uplink.qos.min(2);

    // 4) Validate payload config, compile mapped_json once.
    validate_uplink_payload(&cfg.uplink.payload)?;

    Ok(Arc::new(cfg))
}

fn validate_uplink_payload(payload: &UplinkPayloadConfig) -> NorthwardResult<()> {
    match payload {
        UplinkPayloadConfig::EnvelopeJson => Ok(()),
        UplinkPayloadConfig::Kv { .. } => Ok(()),
        UplinkPayloadConfig::TimeseriesRows { .. } => Ok(()),
        UplinkPayloadConfig::MappedJson { config } => {
            if config.is_empty() {
                return Err(NorthwardError::ConfigurationError {
                    message: "uplink.payload.config must not be empty for mapped_json".to_string(),
                });
            }
            let spec = MappedJsonSpec::from(config.clone());
            CompiledMappedJson::compile(&spec).map_err(|e| NorthwardError::ConfigurationError {
                message: format!("mapped_json compile failed: {e}"),
            })?;
            Ok(())
        }
    }
}
```
::::

### 2) Connector：attempt 级资源边界在哪里建立？（队列/客户端必须 attempt-scoped）

`Connector::new(ctx)` 必须 **同步 + 无 I/O**，只做 downcast 与纯校验。真正的 attempt 级资源边界应该在 `connect()`：

- **内部出站队列（handle → worker）**：在 `connect()` 创建 `mpsc::channel(cap)`，cap 来自配置且在 converter 已 clamp
- **客户端与 eventloop**：在 `connect()` 创建 `AsyncClient + EventLoop`，并把 “真正的网络 I/O 泵” 交给 `Session::init/run` 的 `eventloop.poll()`
- **inflight 上限**：`maxInflight` 是对下游施压的“第一道阀门”，宁可保守也不要无限大

把 attempt 资源限定在 session 生命周期内：

:::: details 点击展开：`关键片段（可直接拷贝）`
```rust
async fn connect(&self, _ctx: SessionContext) -> Result<Self::Session, <Self::Session as Session>::Error> {
    // Attempt-scoped bounded queue for send-path side effects.
    let cap = self.config.uplink.outbound_queue_capacity.max(1);
    let (outbound_tx, outbound_rx) = mpsc::channel(cap);

    // Attempt-scoped MQTT client + event loop.
    //
    // NOTE: the actual socket connect is driven by `event_loop.poll()` in `Session::init/run`.
    let opts = build_mqtt_options(&self.config.connection, &self.app_name)?;
    let request_cap = self.config.connection.max_inflight.max(1).min(4096);
    let (client, event_loop): (AsyncClient, EventLoop) = AsyncClient::new(opts, request_cap);

    Ok(MqttSession::new(MqttSessionArgs {
        handle: Arc::clone(&self.handle),
        outbound_rx,
        outbound_tx: Some(outbound_tx),
        client,
        event_loop,
        // ... other fields
        uplink_qos: self.config.uplink.qos.min(2),
        app_id: self.app_id,
        app_name: Arc::clone(&self.app_name),
        events_tx: self.events_tx.clone(),
    }))
}
```
::::

### 3) Session：Ready 的定义要“明确、低成本”，I/O worker 放在 `run()`

`Session` 表示“一次 supervision attempt 的生命周期”。生产级写法要做到：

- **Ready 边界明确**：`init()` 做短平快的握手/订阅确认（可控超时、尊重 cancel）
- **attempt 依赖注入**：只有 Ready 成立后，才把 `reconnect/outbound_tx` 注入到 hot-path handle
- **run() 驱动 I/O**：用 `tokio::select!` 同时处理 cancel、上行 publish、下行 poll/解码/转发
- **统一重连触发点**：当 publish 失败、eventloop 失败、events_tx 关闭等“attempt 级不可恢复错误”发生时，返回 `ReconnectRequested(reason)`（reason 必须低基数）

init：定义 Ready；run：单 I/O 泵 + 有界 publish + 下行转发：

:::: details 点击展开：`关键片段（可直接拷贝）`
```rust
async fn init(&mut self, ctx: &SessionContext) -> Result<(), Self::Error> {
    // Define "Ready" for this attempt:
    // - observe ConnAck (transport is established)
    // - enqueue required subscriptions (downlink is configured)
    let Some(mut ev) = self.event_loop.take() else { return Ok(()); };

    loop {
        tokio::select! {
            _ = ctx.cancel.cancelled() => {
                self.event_loop = Some(ev);
                return Err(NorthwardError::NotConnected);
            }
            res = ev.poll() => {
                let event = res.map_err(|e| NorthwardError::MqttError { reason: e.to_string() })?;
                if let Event::Incoming(Packet::ConnAck(_)) = event { break; }
            }
        }
    }

    if self.downlink.enabled {
        let tf_ctx = json!({ "app_name": self.app_name.to_string() });
        let filters: Vec<SubscribeFilter> = self
            .downlink
            .topic_filters
            .iter()
            .map(|t| render_template_serde(t.as_str(), &tf_ctx))
            .filter(|t| !t.trim().is_empty())
            .map(|t| SubscribeFilter::new(t, QoS::AtLeastOnce))
            .collect();

        if filters.is_empty() {
            return Err(NorthwardError::ConfigurationError {
                message: "downlink.topicFilters rendered to empty".to_string(),
            });
        }

        self.client.subscribe_many(filters).await.map_err(|e| NorthwardError::MqttError { reason: e.to_string() })?;
    }

    // Attach attempt resources to the hot-path handle only after Ready is defined.
    self.handle.set_reconnect(ctx.reconnect.clone());
    if let Some(tx) = self.outbound_tx.take() {
        self.handle.attach_outbound(tx);
    }
    self.event_loop = Some(ev);
    Ok(())
}

async fn run(mut self, ctx: SessionContext) -> Result<RunOutcome, Self::Error> {
    let reconnect = ctx.reconnect.clone();
    let app_id = self.app_id;
    let mut ev = match self.event_loop.take() { Some(ev) => ev, None => return Ok(RunOutcome::Disconnected) };

    let mut rx = self.outbound_rx;
    let client = self.client;
    let events_tx = self.events_tx;
    let downlink_enabled = self.downlink.enabled;
    let uplink_qos = self.uplink_qos;

    loop {
        tokio::select! {
            _ = ctx.cancel.cancelled() => break,

            maybe = rx.recv() => {
                let Some(item) = maybe else { break; };
                let qos = match uplink_qos { 0 => QoS::AtMostOnce, 1 => QoS::AtLeastOnce, _ => QoS::ExactlyOnce };
                if let Err(e) = client.publish(item.topic.as_str(), qos, false, item.payload).await {
                    warn!(app_id, error=%e, "mqtt publish failed");
                    let _ = reconnect.try_request_reconnect("mqtt_publish_failed");
                    return Ok(RunOutcome::ReconnectRequested(Arc::<str>::from("mqtt_publish_failed")));
                }
            }

            res = ev.poll() => {
                let event = match res {
                    Ok(v) => v,
                    Err(e) => {
                        warn!(app_id, error=%e, "mqtt eventloop stopped with error");
                        let _ = reconnect.try_request_reconnect("mqtt_eventloop_error");
                        return Ok(RunOutcome::ReconnectRequested(Arc::<str>::from("mqtt_eventloop_error")));
                    }
                };

                if !downlink_enabled { continue; }
                if let Event::Incoming(Packet::Publish(p)) = event {
                    match decode_downlink_envelope(p.payload.as_ref(), EnvelopeKind::WritePoint) {
                        Ok(Some(ev)) => {
                            if let Err(e) = events_tx.send(ev).await {
                                warn!(app_id, error=%e, "events_tx closed");
                                let _ = reconnect.try_request_reconnect("events_tx_closed");
                                return Ok(RunOutcome::ReconnectRequested(Arc::<str>::from("events_tx_closed")));
                            }
                        }
                        Ok(None) => {}
                        Err(e) => warn!(app_id, error=%e, "downlink decode failed"),
                    }
                }
            }
        }
    }

    // Detach attempt resources on exit so hot-path fails fast.
    self.handle.detach_outbound();
    Ok(RunOutcome::Disconnected)
}
```
::::

### 4) Handle：为什么 `process_data()` 必须 CPU-only + `try_send`？

`process_data()` 运行在网关 AppActor 的数据面路径上。这里的任何 I/O、等待队列可用（`send().await`）或长时间持锁，都会把背压放大成 **全链路吞吐下降 + 延迟抖动**。

正确姿势：

- **只做 CPU 工作**：构建上下文、编码 payload、渲染 topic（并保持低基数）
- **`try_send` 进入有界出站队列**：队列满则立即失败，让背压“显式”向上游传播
- **I/O 下沉到 `Session::run()`**：publish、eventloop、订阅、下行解码与转发统一治理（错误分类/重连触发点集中）

热路径：encode + render + try_send；绝不在此处 publish：

:::: details 点击展开：`关键片段（可直接拷贝）`
```rust
async fn process_data(&self, data: Arc<NorthwardData>) -> NorthwardResult<()> {
    if !self.config.uplink.enabled {
        return Ok(());
    }

    let event_kind = match data.envelope_kind() {
        EnvelopeKind::DeviceConnected => UplinkEventKind::DeviceConnected,
        EnvelopeKind::DeviceDisconnected => UplinkEventKind::DeviceDisconnected,
        EnvelopeKind::Telemetry => UplinkEventKind::Telemetry,
        EnvelopeKind::Attributes => UplinkEventKind::Attributes,
        _ => return Ok(()),
    };

    // Build encoding context (contains: app/device/point meta, templates, ts, etc).
    let Some(ctx) = build_context_ref(
        self.app_id,
        &self.app_name,
        &self.plugin_type,
        event_kind,
        data.as_ref(),
        &self.runtime,
    ) else {
        return Ok(());
    };

    // Encode payload using SDK (envelope_json / kv / timeseries_rows / mapped_json).
    let payload = encode_uplink_payload_ref(&self.config.uplink.payload, &ctx, data.as_ref(), &self.runtime)
        .map_err(|e| NorthwardError::SerializationError { reason: e.to_string() })?;

    // Render topic on hot path using the same `RenderContextRef` as payload encoding.
    let topic = render_template_serde(self.config.uplink.topic.as_str(), &ctx);
    if topic.trim().is_empty() {
        return Err(NorthwardError::ConfigurationError {
            message: "uplink.topic rendered to empty string".to_string(),
        });
    }

    let ts_ms = ctx.ts.timestamp_millis();
    let outbound = self.load_outbound()?;

    // Never do MQTT I/O here.
    outbound.try_send(OutboundPublish { topic, payload, ts_ms }).map_err(|e| NorthwardError::PublishFailed {
        platform: "mqtt".to_string(),
        reason: format!("outbound queue rejected: {e}"),
    })
}
```
::::

---
