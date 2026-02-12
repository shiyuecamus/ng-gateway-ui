---
title: Northward Plugin Development
description: 'Using MQTT as a Demo, explains step-by-step how to develop a production-ready northward plugin from scratch in NG Gateway: Interface contract, configuration/metadata, backpressure & queues, timeout & retry, observability, testing & release.'
---

# Northward Plugin Development

This chapter is for **Plugin Developers**, aiming to guide you step-by-step to complete a **Production-Ready** Northward Plugin:

-   **Dynamically loadable by Gateway**: Released as `cdylib`, satisfying ABI/Version/Platform constraints
-   **Auto-modeled by UI**: Automatically render configuration forms via Plugin Metadata Schema
-   **Stable and Fast**: High throughput, low latency, controllable downstream jitter, weak network tolerance, observable, troubleshootable

---

## 0. Prerequisites and Hard Constraints

### 0.1 Key Concepts

In NG Gateway, a "Northward Plugin" is not a simple HTTP/Kafka/MQTT client, but a component **isolated by App and hosted by Gateway lifecycle**.

#### 0.1.1 Responsibilities of Host and Plugin

-   **Gateway Side - Host Responsible for**:
    -   Dynamically loading plugin libraries: `./plugins/builtin` and `./plugins/custom`
    -   Probe detection: OS/Arch, checksum, SDK/API version, static metadata (UI Schema)
    -   Unified log bridging and dynamic log level governance (Global/Per-App override)
    -   Creating isolated runtime for each App (Queue, buffer, metrics, span), and delivering `NorthwardData` to plugin according to backpressure strategy
    -   Managing connection and retry (Unified governance by SDK supervision loop)

-   **Plugin Side - Plugin `cdylib` Responsible for**:
    -   Encoding/Mapping `NorthwardData` into platform payload (JSON/Protobuf/Custom)
    -   Optional: Consuming platform downlink messages, and sending business events back to gateway via `NorthwardEvent` (Write Point/Command/RPC)

::: tip `NorthwardData` vs `NorthwardEvent`

-   **`NorthwardData` (Gateway → Plugin)**: Uplink data plane, containing Telemetry/Attributes/Device Online/Offline etc.
-   **`NorthwardEvent` (Plugin → Gateway)**: Downlink business events, containing WritePoint/Command/RPC Response etc., plugin sends back to gateway via `events_tx`, gateway routes to southward.

:::

#### 0.1.2 Two Layers of Backpressure

Data from gateway to plugin passes through at least two layers of bounded queues:

-   **Host → Plugin (per-app) Queue**: Controlled by gateway `QueuePolicy.capacity` etc. policies (Facing system stability)
-   **Plugin actor mailbox**: Controlled by `ng_plugin_factory!(..., channel_capacity=...)` (Facing plugin throughput/latency trade-off)

Further down, production-grade plugins usually introduce:

-   **Handle → I/O worker** "Internal Outbound Queue" (Must be bounded), keeping `process_data()` CPU-only, not doing I/O in AppActor hot path

---

### 0.2 What You Need to Prepare

-   **Rust stable toolchain**
-   **Gateway Local Environment**: Refer to [`Local Development`](/dev/local-dev) to start backend and WebUI
-   **Downstream Platform Environment**: This chapter uses MQTT Broker (Recommend MQTT v5) as Demo, you can use:
    -   Local Broker: `mosquitto` / `emqx` (Docker or native install)
    -   Your platform's MQTT access point (Public/Intranet) for integration and stress testing (Suggest verifying in sandbox environment first)

---

### 0.3 Hard Constraints

::: warning Contracts Must Be Obeyed
1.  **`metadata_fn` must be pure**: Do not read files, environment variables, or network.
2.  **`Connector::new(ctx)` must be synchronous and I/O free**: All network/file/blocking I/O must be placed in `connect()` / `init()` / `run()`.
3.  **Hot Path (`NorthwardHandle::process_data`) forbids blocking**: No synchronous I/O, no long lock holding, no unlimited task spawning.
4.  **Strictly forbid `unwrap()` / `expect()`**: Production-grade code must handle all errors, return `Result` with context.
5.  **Queue must be bounded**: Any channel/queue used for buffering data must be bounded, with clear strategy when full (Reject/Discard/Merge).
6.  **Log must not leak secrets**: token/password/certificate/private key must not enter log, error string, Debug output.
:::

---

## 1. Create Plugin Crate

Before writing code, create a new plugin crate (Recommend prefix `ng-plugin-`).

```bash
cargo new --lib ng-plugin-mqtt
cd ng-plugin-mqtt
```

### 1.1 Cargo.toml Minimal Constraints

Recommend creating plugin crate in independent repository; if developing inside this repository, naming suggest following `ng-plugin-xxx`, facilitating `cargo xtask deploy` auto deployment to `plugins/builtin`.

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

### 1.2 Build Artifact

```bash
cargo build --release
```
Artifact located in `target/release/`, depending on platform: `*.so` (Linux), `*.dylib` (macOS), `*.dll` (Windows).

## 2. Create Plugin Modules

### 2.1 Recommended Project Structure

Recommend following directory structure to keep responsibilities clear:

```text
ng-plugin-mqtt/
  Cargo.toml
  src/
    lib.rs         // Export factory (macro)
    config.rs      // Runtime strongly typed config (serde)
    metadata.rs    // UI Schema (Pure Static)
    converter.rs   // JSON -> Strongly typed config (Low frequency path)
    connector.rs   // Connector: new/connect/classify_error
    session.rs     // Session: init/run (attempt lifecycle)
    handle.rs      // Handle: process_data hot path (CPU-only)
    codec.rs       // (Optional) Encoding/Compression/Signing etc. pure functions
```

### 2.2 Project Module Boundaries

-   **Export Layer (`lib.rs`)**: Only do `ng_plugin_factory!` macro call, no business logic.
-   **Configuration Layer (`config.rs`)**: Strongly typed config (serde), ensure backward compatibility (New fields have default values).
-   **Schema Layer (`metadata.rs`)**: UI Schema (Pure Static), strictly forbid I/O, strictly forbid dependency on runtime state.
-   **Model Conversion Layer (`converter.rs`)**: `serde_json::Value` → `Arc<dyn PluginConfig>`, only do parsing/validation/normalization (Low frequency path).
-   **Connection Layer (`connector.rs`, `session.rs`)**: attempt lifecycle (connect/init/run), retry and cancellation, resource boundary and cleanup.
-   **Hot Path Layer (`handle.rs`)**: `process_data()` must be CPU-only + backpressure capable (`try_send` to internal worker queue).
-   **Downlink Event Layer (Suggest placing in `session.rs`)**: Platform downlink message consumption/subscription belongs to **I/O + Long Loop**, should be responsible by worker started by `Session::run()`, decode payload into `NorthwardEvent` in worker and send back to gateway via `events_tx` (Routed to southward by gateway). Do not put downlink consumption or `events_tx.send().await` into `handle.rs` hot path.
-   **Pure Function Tool Layer (`codec.rs`)**: Encoding/Compression/Signing etc. "Testable Pure Functions", avoid polluting hot path and connection layer.

---

## 3. Configuration and Schema

Northward plugin configuration typically includes:

-   **Connection and Auth**: endpoint, TLS, token, username/password, timeout
-   **Uplink Mapping**: Configure topic and payload by event type (Telemetry/Attributes/...)
-   **Downlink Subscription (Optional)**: Subscribe topic, decode platform message to `NorthwardEvent` and send back to gateway

::: tip Production Advice for Config Design

-   **Backward Compatibility**: New fields must provide default values (`#[serde(default)]` or `default_fn`)
-   **Sensitive Fields**: token/password must be "Not printed, Not debugged, Not spliced into error message" at code level
-   **Limiting**: Clamp risky fields like `capacity/max_inflight` (Prevent config from blowing up system)

:::

### 3.1 `config.rs/types.rs` - Runtime Configuration

Define strongly typed configuration structures for runtime logic.

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

When plugin is installed/Probed, gateway reads **Static Metadata** (JSON bytes) exported by plugin. UI uses it to render forms and do pre-validation.

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

::: warning Schema Design Points

-   **Field Path (path)**: Must match serde field name in `config.rs`/`types.rs`.
-   **Validation First**: Use `Rules` (min, max, pattern, required) to intercept errors at UI layer.
-   **Default Value**: Provide reasonable `default_value` for optional items.
-   **I18n**: Use `ui_text!` macro to provide English/Chinese comparison.

:::

---

## 4. Implement Model Convert

Plugin factory exported by plugin library needs to convert UI submitted JSON config to downcastable strongly typed object `Arc<dyn PluginConfig>`.
::: tip `Responsibilities`
-   Parse/Normalize config (trim string, empty string → None, fill default value, field name compatibility etc.)
-   Pre-validation (Required items, range constraints: keep_alive, capacity, max_inflight, broker/topic validity)
-   Precompile/Prevalidate expressions (e.g., `mapped_json` JMESPath expression compiled here once, avoid dragging failure to runtime)
-   Limiting and Explosion Prevention (Clamp risky fields like `capacity/max_inflight`, avoid config blowing up gateway/downstream)

> This can significantly reduce CPU and allocation overhead of hot path (`process_data`), and expose errors as early as "Save Config / Enable Plugin" stage
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

## 5. Implement Connector / Session / Handle

### 5.1 Connector

#### 5.1.1 Connector Responsibilities, Production Advice

::: tip `Responsibilities`

-   `new(ctx)`: Capture dependencies + downcast strongly typed config + pure validation/normalization (No I/O)
-   `connect(ctx)`: Create attempt-scoped `Session` (Allow I/O)
-   `classify_error(phase, err)`: Classify errors into Retryable vs Fatal, avoid retry storm or misjudgment death

:::

::: warning Production Advice
-   Classify common errors "Controllably" in `classify_error`
    -   **Retryable**: Transient network fluctuation, timeout, connection reset, serial port temporarily unavailable
    -   **Fatal/Stop**: Configuration error (Illegal address/Illegal certificate path), Auth failure (Explicitly unrecoverable)
-   Provide stable aggregation dimensions for `error_summary/error_code` to facilitate alerting and troubleshooting
    -   `error_summary`: Human-readable short sentence (**Do not** stuff large objects/long stacks)
    -   `error_code`: Stable, low cardinality (e.g., `tcp_connect_timeout` / `auth_failed` / `config_invalid` / `protocol_decode_error`)
-   **Do not** do any network/blocking I/O here (`Connector::new(ctx)` explicitly forbids I/O; `connect()` is the place to establish session)
-   Leave "High frequency details" to `tracing`, leave "Low frequency aggregation dimensions" to `error_code/error_summary`
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

::: details `ExtensionStore` and `Provisioning`

`NorthwardInitContext` provides `extension_store` (host-owned persistent KV), used for scenarios where "Plugin needs persistence but shouldn't write local files":

-   Credentials obtained after platform provision (token/key/certificate summary)
-   Downstream assigned client_id / tenant_id
-   Small amount of state needed for connection self-recovery (Watch size and privacy)

Best Practice:

-   **Read/Write only in Control Plane**: Put in `connect()` or `init()` (Low frequency), do not put in `process_data()` hot path.
-   **Write Idempotently**: Avoid concurrent duplicate provision.
-   **Do Not Log Secrets**: Log only "Exists/Updated", do not log content.

Ref Implementation: Provision flow in `ng-gateway-northward/thingsboard/src/connector.rs`.

:::

### 5.2 Session

> `Session` represents "Lifecycle after a successful attempt (connection attempt)"

#### 5.2.1 Session Responsibilities, Production Advice

::: tip `Responsibilities`
-   `handle()`: Return `Arc<Handle>` (Data plane hot path interface)
-   `init(&ctx)`: Define Ready boundary (Short, fast, controllable timeout)
-   `run(ctx)`:
    -   Start `attempt-scoped I/O worker`, drive until disconnect/cancel/request reconnect
    -   **Downlink subscription/consumption, message decoding to `NorthwardEvent`, and forwarding back to gateway via `events_tx` should also be placed here**
:::

::: warning Production Advice
-   Do "Short and Fast" handshake validation in `init()` (Controllable timeout), do not put long loop into `init()`
-   Use `tokio::select!` in `run()` to handle simultaneously:
    -   cancel (Graceful exit)
    -   Heartbeat/Keep-alive
    -   Join of uplink/downlink tasks
    -   Listen to internal "Request Reconnect" signal: When protocol layer detects unrecoverable transport exception/long timeout, call `ctx.reconnect.try_request_reconnect(reason)` to trigger supervision loop reconnect (**Do not await**)
-   More precise classification of CONNACK / SUBACK / PUBACK reason codes (Which should retry, which should be Fatal)
-   Implement controllable retry for publish/subscribe failures (Limited times + jitter), avoid retry storm
-   Batching/Compression (Reduce bandwidth and connection overhead)
-   Idempotency Key (Prevent downstream duplicate consumption)
:::

::: details `Lifecycle Semantics Quick Reference`

-   `Connector::new(ctx)`
    -   **What to do**: Capture dependencies (`app_id/app_name/runtime/events_tx/retry_policy/extension_store` etc.), downcast strongly typed config, do pure validation/normalization.
    -   **Must**: Synchronous, I/O free, Non-blocking; failure should return `ConfigurationError` (Diagnosable).
    -   **Do not**: Spawn long tasks; do not do network/file I/O; do not do "Uncontrollable duration" probing here.

-   `Connector::connect(ctx)`
    -   **What to do**: Create attempt-scoped `Session` (Allow I/O, e.g., creating client/producer, establishing connection, doing lightweight probe).
    -   **Must**: Respect `ctx.cancel`; all I/O has timeout; limit "attempt level resources" within `Session` lifecycle.
    -   **Do not**: Do infinite loop here (Should be put in `Session::run`); do not create background tasks without cancellation.

-   `Session::init(&ctx)`
    -   **What to do**: Define Ready boundary (e.g., Auth validation, Subscription establishment, Routing table precompilation, Inject necessary dependencies into handle).
    -   **Must**: Short, fast, controllable timeout; failure semantics clear (auth/config/protocol).

-   `Session::run(ctx)`
    -   **What to do**: Drive attempt until disconnect/cancel/request reconnect; Start I/O worker here (Uplink publisher, Downlink consumer etc.).
    -   **Must**: `tokio::select!` handle cancel + worker join simultaneously; clean up resources on exit; `ctx.reconnect.try_request_reconnect(reason)` if necessary (Do not await).

-   `NorthwardHandle::process_data(data)`
    -   **What to do**: Hot path encoding + routing + `try_send` to internal outbound queue.
    -   **Must**: CPU-only + Non-blocking; backpressure propagates upstream as error/rejection semantics (Avoid unbounded accumulation).

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

#### 5.3.1 Handle Responsibilities, Production Advice, Hot Path Contract

::: tip `Responsibilities`

-   `process_data(data)`: Hot path encoding + routing + `try_send` to internal outbound queue (CPU-only)
-   Backpressure: If queue full, return `PublishFailed` (Rejection semantics propagate upstream, avoid unbounded accumulation)

:::

::: warning Production Advice

-   **Do not block in hot path**:
    -   No synchronous I/O;
    -   No `send().await` waiting for queue; Avoid long lock holding or large allocation
-   All network I/O should sink to worker loop in `Session::run()` (Centralized governance, cancellable, reconnectable)

Why `try_send`?

Because `process_data()` runs on the data plane path of Gateway AppActor. If you `await` I/O or `send().await` waiting for queue availability here, it will "amplify" backpressure into overall throughput drop and latency jitter.

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

## 6. Observability

### 6.1 Logging (tracing) Best Practices

Host will do the following when loading plugin:

-   Call `ng_plugin_set_log_sink` to register log sink (Merge plugin logs into host unified log pipeline)
-   Call `ng_plugin_init_tracing` to initialize plugin side tracing bridge
-   (Optional) Call `ng_plugin_set_max_level` to dynamically adjust plugin max log level

Plugin side best practices:

-   **Structured Fields**: At least include `app_id`, if necessary `plugin_type`; avoid using device/point/value as fields (High cardinality will drag down log and metric system).
-   **Sensitive Info Redaction**: token/password/certificate/private key never output (Including `Debug` print config, error string splicing).
-   **Hot Path Control**: `debug/trace` only for dev/troubleshooting, usually closed in production; hot path (`process_data`) do not output payload of every data.
-   **Low Cardinality Reconnect Reason**: `reason` in `RunOutcome::ReconnectRequested(reason)` / `try_request_reconnect(reason)` must be **Stable Short Sentence** (e.g., `downstream_timeout`, `non_success_response`, `peer_task_exited`), do not stuff full error chain/dynamic string into it (Otherwise metric dimensions explode, and hard to aggregate alerts).

### 6.2 Metric (Observer / Metrics) Usage Principles

::: tip Status Explanation

-   **You don't need to care about metric integration for now**: Key basic metrics of Northward App in current version are uniformly collected and displayed by Host/SDK (Connection governance related signals, delivery/processing aggregated statistics etc.), plugin authors do not need extra integration.
-   **Plugin internal finer-grained business metrics not supported yet**: e.g., backpressure reason buckets, downstream error code classification, inflight/concurrency gauge etc., currently no standard path directly into Host Prometheus metric family; if troubleshooting needed please prioritize logs and Realtime Monitor.

:::

### 6.3 Backpressure and Capacity

Production-grade plugins must answer at least three questions:

-   **What if queue is full?** (Reject/Discard/Merge) This chapter template defaults: `try_send` fails → Return `PublishFailed` (Propagate backpressure "Explicitly" upstream).
-   **How many dropped? Why dropped?** (Metrics/Logs should explain; and reason low cardinality)
-   **How to tune?** (Tell user whether to tune `QueuePolicy.capacity` or `channel_capacity` or plugin internal outbound queue)

**Tuning Reference Table**

| Layer | Parameter/Location | Function | Typical Symptom | Recommended Practice |
|---|---|---|---|---|
| Host → Plugin (per-app) Queue | App's `QueuePolicy.capacity` (Gateway Side) | Control "Gateway→Plugin" delivery backpressure boundary | app queue drops increase; uplink decreases | Prioritize governance as system level protection; Choose DropPolicy by business importance |
| Plugin actor mailbox | `ng_plugin_factory!(..., channel_capacity=...)` | Control RuntimeAwarePlugin actor mailbox (Gateway→Plugin 2nd layer) | Plugin obviously can't keep up; delivery failure | Keep bounded; don't blindly set huge; assess combining CPU/downstream capability |
| Handle → I/O worker Internal Queue | `uplink.outboundQueueCapacity` (Plugin Config) | Ensure `process_data()` CPU-only, sink I/O to worker | `PublishFailed: outbound queue rejected` | Most common tuning point on plugin side; need to cooperate with max_inflight and batch strategy |
| I/O Concurrency Limit | `connection.maxInflight` (Plugin Config) | Limit worker simultaneous in-flight publish | PUBACK backlog, End-to-end latency spike, Broker disconnect/throttle | Limit concurrency first, then batch/compress; avoid amplifying hit on Broker |

:::: tip Rule of Thumb
**Prioritize Bounded + Explainable**, then "Higher Throughput". Throughput relies on Batch/Compression/Lower per-item overhead, not infinite queue enlargement.
::::

## 7. `lib.rs`: Export ABI Factory

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

## 8. Testing Strategy

### 8.1 Unit Test

-   codec: topic template parsing, payload encoding (`envelope_json/kv/timeseries_rows/mapped_json`), QoS/attribute mapping, illegal data tolerance
-   planner: Batch/Merge algorithm (if any), `max_inflight` limit clamp, backpressure strategy (`try_send` rejection semantics), retry/backoff calculation (pure function part)
-   model convert: `broker/client_id/topic_filters` validity, default value, limit clamp, illegal input error semantics

### 8.2 Integration Test

-   Start MQTT Broker (Recommend containerized)
-   Write test cases, connect Broker via `Connector`, verify:
    -   Normal publish/subscribe path (topic, QoS, payload)
    -   Timeout, Disconnect, Reconnect (Verify supervision attempt exit semantics and low cardinality reconnect reason)
    -   Auth failure/Certificate error (Should be Fatal, should not infinite retry)
    -   Concurrency pressure (Verify backpressure and memory limit: Host queue, Plugin mailbox, Plugin internal outbound queue)

### 8.3 Performance Benchmark

Repository already has `ng-gateway-bench` (Can refer to its Modbus bench entry):

-   codec micro-bench (ns/op per encode)
-   planner bench (Point scale scaling: 1k/10k points)
-   end-to-end bench (Collection → MQTT publish → Broker → Subscriber verification)

---

## 9. Debugging and Release

### 9.1 Complete Process

Goal: Complete **Upload → Probe → Install → Bind App → Enable → Northward Verification** loop for a **Custom Northward Plugin** via WebUI.

1) **Compile Plugin Artifact (cdylib)**

-   `cargo build --release`
-   Artifact located in `target/release/` (Linux `.so` / macOS `.dylib` / Windows `.dll`)

2) **WebUI Upload Plugin and Probe**

-   Enter "Plugins" page in WebUI, upload artifact
-   Probe page focus confirmation:
    -   OS/Arch, checksum
    -   `plugin_type`, `version`
    -   `api_version` / `sdk_version`
    -   Whether static metadata (UI Schema) correctly renders configuration form

3) **Install and Bind to App**

-   Click Install (Install as custom plugin)
-   Create/Select an App, bind this plugin to App
-   Fill minimal usable configuration (Run through first then extend), and enable plugin instance

4) **Observation and Troubleshooting (Part of Loop)**

-   Confirm in UI/Log:
    -   Plugin status and attempt lifecycle stability (Whether reconnecting, reconnect reason low cardinality)
    -   Backpressure/Rejection explainable (`PublishFailed`, queue rejected stats)
    -   Error classification correctness (Config/Auth should be Fatal, transient I/O Retryable)

5) **Execute Northward Verification per 9.3**

-   uplink: Subscribe expected topic, confirm receipt of publish
-   downlink (if enabled): Publish a command/write point envelope to subscribed topic, confirm gateway receives and routes

### 9.2 Release and Compatibility Checklist

-   **Multi-platform Artifacts**: `.so/.dylib/.dll` and OS/Arch must match runtime environment
-   **ABI/API Version**: loader validates `ng_plugin_api_version()` consistent with host (Reject if inconsistent)
-   **SDK Version**: Not recommended to mix across major versions; at least confirm `sdk_version` matches expectation in Probe page
-   **Dynamic Dependency**: Confirm artifact does not depend on dynamic libraries missing in runtime environment (Especially TLS/openssl related)
-   **Config Compatibility**:
    -   New fields must have default values (`serde(default)`)
    -   Schema path and config fields consistent, backward compatible
-   **Security and Compliance**:
    -   Username/Password/Certificate/Private Key must not enter log and error string
    -   TLS validation enabled by default (If provide "Disable Validation" switch, must strongly warn risk)
-   **Topic and Payload Versioning**: Recommend using `ng/v1/...` form, and keep topic low cardinality (High cardinality into payload)

### 9.3 Northward Verification

This section gives a landing integration loop: **Use Local Broker + Subscriber** to verify uplink/downlink, and confirm observability and backpressure semantics via UI/Log.

#### 9.3.1 Start Local MQTT Broker (Choose one)

Use `mosquitto` (Lightest):

```bash
docker run --rm -it -p 1883:1883 eclipse-mosquitto:2
```

Or use `emqx` (Closer to production capability):

```bash
docker run --rm -it -p 1883:1883 -p 18083:18083 emqx/emqx:5
```

#### 9.3.2 Prepare Subscriber

If you have `mosquitto_sub`:

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 -t 'ng/v1/+/uplink' -v
```

Can also use MQTTX (GUI/CLI both fine) to subscribe same topic, easy to observe payload.

#### 9.3.3 Uplink Verification

-   After enabling plugin in WebUI, let southward driver generate an uplink data (Telemetry/Attributes/Online/Offline etc.)
-   Subscriber should see publish:
    -   topic: Form like `ng/v1/<app>/uplink`
    -   payload: Recommend using SDK's `envelope_json` (Stable versioned), easy for downstream parsing and replay

If subscriber receives no message, prioritize positioning from UI/Log:

-   Is probe passed, plugin enabled
-   Is outbound queue continuously rejected (Backpressure too early)
-   Is MQTT eventloop reconnecting (Reason low cardinality: `mqtt_eventloop_error` / `mqtt_publish_failed` etc.)

#### 9.3.4 Downlink Verification

Prerequisite: Enable downlink in plugin config, and subscribe `ng/v1/{{app_name}}/downlink/#` (Or your custom filters).

Use `mosquitto_pub` to send a "Write Point" envelope (Example for demo purpose, actual fields need to align with your SDK envelope convention):

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

Verification Points:

-   Plugin log should show low frequency signal of downlink decode/forward (Do not print full payload)
-   Gateway side should see corresponding `NorthwardEvent` routed to southward (If southward not connected, verify event reached host first)

#### 9.3.5 Fault Injection, Verify Reconnect and Backpressure Semantics

-   **Disconnect Reconnect**: Stop Broker for 10 seconds then resume, observe if attempt can reconnect, reason low cardinality and aggregatable
-   **Auth Failure**: Configure wrong username/password, expect classify as Fatal (Do not infinite retry)
-   **Backpressure/Memory Limit**: Tune down `outboundQueueCapacity` and create burst traffic, observe if rejected metrics and logs can explain "Why dropped/Why slow"

---

## 10. Common Pitfalls

-   **Doing I/O in `Connector::new()`**: Breaks contract, causes startup phase blocking or rejection
-   **Doing Network Request in `process_data()`**: Throughput drops hugely, latency jitter, and drags down AppActor
-   **Unbounded Queue**: Short time downstream jitter blows up memory
-   **Error Classification Too Coarse**: All Retryable leads to retry storm; All Fatal treats transient fault as permanent failure
-   **Log Leak**: Token/Password output to log equals security incident
-   **High Cardinality as Metric Label**: device_id/point_id in label will explode Prometheus directly

---

## 11. Key Demo Code Explanation

### 1) Converter: Where do field-level constraints take effect?

`Converter` is the place that should "Do a bit more", because it runs in low frequency path (Save Config / Enable Plugin / Reload Config), can afford parsing and validation cost:

-   **Normalization**: Trim, Empty string → None, Filter empty topic filters, fewer branches/allocations at runtime
-   **Required and Validity Check (Validate)**: broker/client_id/topicFilters/topic "Empty/Illegal" fail directly at config stage
-   **Limiting Explosion Prevention (Clamp)**: `keep_alive/max_inflight/outboundQueueCapacity/qos` clamp, avoid config blowing up gateway/downstream
-   **Expression Precompilation (Compile once)**: `mapped_json` compiled once here, avoid recompiling per message or dragging error to runtime

Low frequency path four steps: Deserialize → Normalize → Validate → Clamp + Precompile.
