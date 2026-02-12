---
title: Southward Driver Development
description: 'Using Modbus as a Demo, explains how to develop a production-ready southward driver from scratch in NG Gateway: Interface contract, configuration/metadata, concurrency & backpressure, timeout & retry, observability, testing & release.'
---

# Southward Driver Development

This chapter is for **Driver Developers**, aiming to guide you step-by-step to complete a **Production-Ready** Southward Driver:

-   **Dynamically loadable by Gateway**: Released as `cdylib`, satisfying ABI/Version constraints
-   **Auto-modeled by UI**: Automatically render configuration forms and Excel import templates via Driver Metadata Schema
-   **Stable and Fast**: High throughput, low latency, weak network tolerance, traceable, troubleshootable

## 0. Prerequisites and Hard Constraints

### 0.1 Key Concepts
In NG Gateway, a "Southward Driver" is not just a pure protocol parsing library, but a component **whose lifecycle is hosted by the Gateway**:

-   **Gateway Side - Host** is responsible for:
    -   Dynamically loading/probing driver libraries
    -   Unified log bridging, dynamic log levels, observability aggregation
    -   Creating runtime views of Channel/Device/Point/Action based on configuration, and driving collection/write-back
-   **Driver Side - Driver cdylib** is responsible for:
    -   Implementing "How to connect device + How to collect + How to write back/execute action"
    -   Providing a **Static Metadata Schema** (For UI and Excel import), and necessary ABI export symbols

### 0.2 What You Need to Prepare

-   **Rust Development Environment**: Install latest stable toolchain.
-   **Gateway Local Environment**: Refer to [Local Development](/dev/local-dev) to set up backend and WebUI, ensuring they run.
-   **Protocol Simulator**: Prepare the protocol simulator you want to develop (e.g., Modbus Slave / TCP Server) for local integration testing.

### 0.3 Hard Constraints

::: warning Contracts Must Be Obeyed
1.  **`metadata_fn` must be pure**: Do not read files, environment variables, or network. Probe phase must be reproducible and side-effect free.
2.  **`Connector::new(ctx)` must be synchronous and I/O free**: All network/file/blocking I/O must be placed in `connect()` / `init()` / `run()`.
3.  **Hot Path (`SouthwardHandle`) forbids blocking**: `collect_data` / `write_point` must be asynchronous non-blocking, forbidding long lock holding or synchronous I/O.
4.  **Strictly forbid `unwrap()` / `expect()`**: Production-grade code must handle all errors, return `Result` with context.
:::

## 1. Create Plugin Crate

Before writing code, create a new driver crate (Recommend prefix `ng-driver-`).

```bash
cargo new --lib ng-driver-yourproto
cd ng-driver-yourproto
```

### 1.1 Cargo.toml Minimal Constraints

Recommend creating driver crate in independent repository, depending on `ng-gateway-sdk`.

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

### 1.2 Build Artifact

```bash
cargo build --release
```
Artifact located in `target/release/`, depending on platform: `*.so` (Linux), `*.dylib` (macOS), `*.dll` (Windows).

## 2. Create Plugin Modules

### 2.1 Recommended Project Structure

Recommend following directory structure to keep responsibilities clear:

```text
ng-driver-yourproto/
  Cargo.toml
  src/
    lib.rs         // Export factory
    metadata.rs    // UI Schema (Pure Static)
    types.rs       // Runtime Config Structs (serde)
    converter.rs   // Model -> Runtime Conversion
    connector.rs   // Connector Implementation
    session.rs     // Session Implementation
    handle.rs      // SouthwardHandle Implementation (Hot Path)
    codec.rs       // Protocol Encoding/Decoding
    planner.rs     // (Optional) Batch Planning Strategy
    protocol/      // (Optional) Complex Protocol Stack Encapsulation
      mod.rs
      frame.rs
      codec.rs
      client.rs
      session.rs
```

### 2.2 Project Module Boundaries

-   **Export Layer (`lib.rs`)**: Only do `ng_driver_factory!` macro call.
-   **Configuration Layer (`metadata.rs`, `types.rs`)**: Define how UI displays, and how configuration deserializes.
-   **Protocol Layer (`codec.rs` or `protocol/`)**: Handle conversion between byte stream and protocol frames. Simple protocols directly in `codec.rs`; complex protocols (like S7/IEC104) suggest extracting `protocol` module, containing frame definition, state machine etc.
-   **Connection Layer (`connector.rs`, `session.rs`)**: Manage connection lifecycle, reconnection, resource initialization.
-   **Hot Path Layer (`handle.rs`)**: Responsible for high-frequency collection and control command execution.

## 3. Configuration and Schema

### 3.1 `config.rs/types.rs` - Runtime Configuration

Define strongly typed configuration structures for runtime logic.

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

// Device, Point, Action config similarly...
```

:::

### 3.2 `metadata.rs` - UI/Excel Schema

Define UI form structure, supporting validation and i18n.

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
            // ... port, timeout fields
        ],
        device: vec![], // Define device level config
        point: vec![],  // Define point level config
        action: vec![], // Define action level config
    }
}
```

:::

::: warning Schema Design Points

-   **Field Path (path)**: Must match serde field name in `config.rs`/`types.rs`.
-   **Validation First**: Use `Rules` (min, max, pattern, required) to intercept errors at UI layer.
-   **Default Value**: Provide reasonable `default_value` for optional items.
-   **I18n**: Use `ui_text!` macro to provide English/Chinese comparison.

:::

## 4. Implement Model Convert

::: tip `Responsibilities`
-   Parse/Normalize address (e.g., 0/1 base conversion, string trim)
-   Precompile expressions (e.g., mapping/filtering/template)
-   Precalculate register span, fixed length, byte order strategy
-   Preallocate/Cache Planner static structures (e.g., index grouped by function code)

> This can significantly reduce CPU and allocation overhead for each collection
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
        // 1. Deserialize driver_config to strongly typed config
        let config: YourProtoChannelConfig = serde_json::from_value(channel.driver_config.clone())
            .map_err(|e| DriverError::ConfigurationError(format!("Invalid channel config: {e}")))?;

        // 2. Construct RuntimeChannel (Usually a struct containing common fields + strongly typed config)
        Ok(Arc::new(YourProtoChannel {
            id: channel.id,
            name: channel.name,
            // ... copy other common fields (status, collection_type etc.)
            config, // Inject strongly typed config
        }))
    }

    fn convert_runtime_device(&self, device: DeviceModel) -> DriverResult<Arc<dyn RuntimeDevice>> {
        // Parse device level driver_config
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
        // Parse point level driver_config, extract key parameters needed for hot path
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
        // If action supported, parse ActionModel here
        Err(DriverError::NotImplemented("Action not supported".into()))
    }
}
```

:::

## 5. Implement Connector / Session / Handle

### 5.1 Connector

#### 5.1.1 Connector Responsibilities, Production Advice
::: tip `Responsibilities`
-   Save initialization context (Config, runtime view, observer, policy, etc.)
-   Implement `connect(ctx)`: Establish a `Session`
-   Implement `classify_error(phase, err)`: Tell supervision loop whether to retry this error
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
        // Do I/O here, establish connection
        let stream = tokio::net::TcpStream::connect((self.config.ip.as_str(), self.config.port))
            .await
            .map_err(|e| DriverError::SessionError(e.to_string()))?;
            
        Ok(YourSession::new(self.handle.clone(), stream))
    }

    fn classify_error(&self, _phase: FailurePhase, _err: &DriverError) -> FailureKind {
        // Simple classification, can refine based on specific err type
        FailureKind::Retryable
    }
}
```

:::

### 5.2 Session

> `Session` represents "Lifecycle after a successful attempt (connection attempt)"

#### 5.2.1 Session Responsibilities, Production Advice
::: tip `Responsibilities`
-   `handle()`: Return `Arc<Handle>` (Hot path interface)
-   `init(&ctx)`: Complete "Initialization defining Ready" (e.g., read device info, subscribe, write initial state)
-   `run(ctx)`: Drive session until disconnect/cancel/request reconnect
:::

::: warning Production Advice
-   Do "Short and Fast" handshake validation in `init()` (Controllable timeout), do not put long loop into `init()`
-   Use `tokio::select!` in `run()` to handle simultaneously:
    -   cancel (Graceful exit)
    -   Heartbeat/Keep-alive
    -   Join of uplink/downlink tasks
    -   Listen to internal "Request Reconnect" signal: When protocol layer detects unrecoverable transport exception/long timeout, call `ctx.reconnect.try_request_reconnect(reason)` to trigger supervision loop reconnect (**Do not await**)
:::

::: details `Lifecycle Semantics Quick Reference`

-   `Connector::connect(ctx)`
    -   **What to do**: Establish transport (TCP/UDP/Serial) and complete protocol layer connect/handshake, construct `Session`
    -   **Must**: Respect `ctx.cancel`; set controllable timeout; prioritize using SDK's metered transport (Ensure `transport_meter` metering complete)
    -   **Do not**: Publish handle here (Ready is defined by `Session::init`); Do not spawn background tasks without cancellation

-   `Session::init(&ctx)`
    -   **What to do**: Define "Ready" boundary, inject dependencies needed for data-plane operation into `handle()` (e.g., connection pool, subscription manager, reconnect handle)
    -   **Must**: Low cost, controllable timeout; failure must be aggregatable by `error_summary/error_code` (Commonly auth/permission/protocol incompatibility)
    -   **Do not**: Start infinite loop (Should be put in `run()`); Do not do uncontrollable full scan

-   `Session::run(ctx)`
    -   **What to do**: Drive session until disconnect/cancel/request reconnect, responsible for attempt level resource boundary and cleanup
    -   **Return Value**: Prioritize `Disconnected` or `ReconnectRequested(reason)`; only use `Fatal(FailureReport)` when explicitly unrecoverable
    -   **Must**: Release connection/subscription/background tasks on exit; ensure cancel path is fast and idempotent
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
        // Inject dependencies into Handle (e.g., stream)
        if let Some(stream) = self.stream.take() {
            self.handle.attach_transport(stream, ctx.reconnect.clone());
        }
        Ok(())
    }

    async fn run(self, ctx: SessionContext) -> Result<RunOutcome, Self::Error> {
        // Wait for cancel signal
        ctx.cancel.cancelled().await;
        // Clean up resources
        self.handle.detach_transport();
        Ok(RunOutcome::Disconnected)
    }
}
```

:::

### 5.3 Handle

#### 5.3.1 Handle Responsibilities, Production Advice, Hot Path Contract

::: tip `Responsibilities`
-   **Collection Planning**: Formulate optimal protocol request strategy based on `CollectItem` (e.g., merge adjacent registers, batch request), reduce network I/O count.
-   **Protocol Interaction**: Acquire connection, execute protocol request, and handle timeout and retry.
-   **Data Mapping**: Decode protocol response (bytes/words) to `NGValue`, and encapsulate as `NorthwardData`.
-   **Action/Write Point**: Handle write request, execute necessary encoding conversion, and return execution result.
-   **Grouping Strategy**: (Optional) Implement `collection_group_key`, aggregate collection of multiple logical devices belonging to one physical connection.
:::

::: warning Production Advice
-   **Do not block in hot path**: Avoid holding lock for long time, avoid large allocation, avoid synchronous I/O; sink slow work to internal actor/worker if necessary.
-   **Timeout Control**: All I/O operations must have timeout.
-   **Failure Semantics Must Be Clear**: Errors like `ServiceUnavailable/Timeout/ExecutionError` should be diagnosable; encountering transport-level exception should trigger `try_request_reconnect(...)` ASAP, letting kernel supervision loop unify governance of backoff and reconnection.
:::

#### 5.3.2 Handle Function List and Details

-   `collect_data`: Batch collect data.
-   `collection_group_key`: (Optional) Define how to group devices for collection.
::: details When should `group collection` be used

Only when you can answer: **Do these business Devices share the same "Physical Session Semantics", and does the protocol side have usable batch capabilities?**

Typical Scenarios:

-   **Modbus**: Points under the same slave (station number) are split into multiple business Devices (Modeled by production line/functional area/sub-device), but physically still "One batch read/write per slave".
-   **OPC UA**: Under the same endpoint/channel/session, nodes are split to multiple business Devices for business organization; physically can be merged into one `Read` (or few batch Reads).
-   **EtherNet/IP / MC / S7**: Multiple business Devices within the same connection (usually bounded by channel) share session and transport, suitable for merging into group calls to reduce scheduling and protocol request count.

Counter-examples (Do not group):

-   Each business Device must exclusively occupy a connection (Different IP/Port/Serial Port), merging will only let slow devices drag down fast devices, and amplify timeout impact.
-   Protocol does not support batch, or batch leads to worse stability (Some devices very sensitive to large requests/packets).

How should `collection_group_key` be defined?

The semantics of `CollectionGroupKey` must be: **"A group of business Devices that can share one physical collection/same session context"**.

Must obey:

-   **Stable**: Cannot use random numbers, cannot use temporary values that change with restart/refresh.
-   **Low Cardinality**: Strictly forbid including `device_id/point_id` (That equals no grouping and leads to oversized HashMap).
-   **Allocation-free/Low Overhead**: This method runs in high frequency path, must achieve O(1) and zero allocation.
-   **Express Physical Session Semantics**: Usually comes from protocol layer "Shared Boundary", like slaveId, channelId, endpoint/session identity etc.

**`Concrete Examples: How to choose key's "Physical Semantics"`**

-   **Ex 1: Modbus (Group by slaveId)**
    -   Applicable: One slave split into multiple business Devices.
    -   key: `kind="MODB"` + `payload=slave_id`.
    -   Ref Implementation: `ng-gateway-southward/modbus/src/handle.rs` uses `CollectionGroupKey::from_u64(kind, slave_id as u64)`.

-   **Ex 2: OPC UA (Group by channelId/endpoint session)**
    -   Applicable: Multiple business Devices under same OPC UA connection/session share one batch Read.
    -   key: `kind="OPCU"` + `payload=channel_id` (Or stable hash prefix of endpoint).
    -   Ref Implementation: `ng-gateway-southward/opcua/src/handle.rs` groups by `channel_id`.

-   **Ex 3: Multi-session Scenario (Group by "Connection ID + Sub-channel")**
    -   Applicable: One driver internally maintains multiple physical sessions (e.g., multiple targets under same channel, and each target needs independent connection pool).
    -   key: Use `CollectionGroupKey::from_pair_u64(kind, a, b)` to combine two stable ids (Note it truncates to 48-bit, suitable for medium/small range integer ids).
    -   If identifier is more complex (host:port, certificate fingerprint, endpoint URL etc.), suggest doing stable hash (e.g., 128-bit) on it, then use `from_hash128(kind, hash128)` to truncate first 12 bytes as payload.

> Rule of Thumb: **Better group less than group wrong**. Wrong grouping leads to protocol semantic errors (e.g., mixing different slaves/endpoints into same batch), usually harder to troubleshoot than "Slower due to no grouping".

:::
-   `collector_concurrency_profile(&self) -> CollectorConcurrencyProfile` (Optional, declare collection concurrency capability: cross-group / intra-group / I/O lanes; used to protect device/bus and let the Collector adapt automatically)
-   `write_point`: Write point value.
-   `execute_action`: Execute action command.
::: details `write_point/execute_action` Semantic Key Points
-   **Timeout**: `write_point(..., timeout_ms)` should be "Single Operation Limit", avoid infinite wait (Commonly `tokio::time::timeout`)
-   **Reconnect**: Encounter transport error/consecutive timeout, should trigger `try_request_reconnect(reason)`, and return diagnosable error (Do not await reconnect in hot path)
-   **Return Value**: Use `WriteResult/ExecuteResult` to express business semantics (Completed/Queued), do not misreport "Queued Successfully" as "Execution Completed"
:::
-   `apply_runtime_delta(delta) -> DriverResult<()>`

::: details `apply_runtime_delta(delta)` In-depth Explanation
`apply_runtime_delta(delta)` is used to receive **Runtime Model Incremental Change** notifications from Host (Gateway) **during driver operation**, and apply these changes to **Driver Internal Long-term State** (Cache, Collection Plan, Subscription Set, Action Routing Table, etc.), thereby achieving:

-   Make added/deleted/updated devices, points, actions effective without restarting driver/reconnecting device (or minimizing reconnection)
-   Especially in **`CollectionType::Report` (Subscription/Event Reporting)** scenarios, avoid data confusion like "Point changed but subscription set not updated"

Its semantics is not "Change everything arbitrarily", but **Handle runtime `RuntimeDelta` events**. Currently `RuntimeDelta` only contains three types (Channel scope, ordered delivery):

-   **`DevicesChanged`**: Device add/update/remove, and device `status` change
-   **`PointsChanged`**: Point add/update/remove under a device (Including point `driver_config` / transform etc. runtime info)
-   **`ActionsChanged`**: Action add/update/remove under a device (Command definition, parameters, etc.)

**`When must implement?`**
-   **Subscription/Report Mode almost must implement**: Because you usually maintain a "Subscription Set/Callback Map/Point Snapshot/Filter Rule", if not updated after point change, consequences are usually more severe than collection mode (Missed report, Wrong report, Duplicate report, Keep reporting deleted points).
-   **Collection Mode suggest implementing (Not mandatory, built-in polling drivers may also do no-op first)**: Because `collect_data()` gets latest `(device, points)` (`CollectItem`) every time, many pure polling drivers can maintain "Functional Correctness" even without implementing `apply_runtime_delta`. But when you introduce Planner (Batch merge strategy), Address/Codec Cache, Device Session Table/Connection Pool or Background Worker, and want device/point changes to **Take effect quickly** and minimize restart/reconnect, implementing `apply_runtime_delta` will significantly improve consistency, performance and O&M experience.

**`How to use?`**

Design it as **Control-plane Entry**: Receive changes quickly, update memory structure, notify background task to rebuild local state if necessary.

-   **1) Avoid slow operations / Network I/O in `apply_runtime_delta`**
    -   Suggest only doing: Update memory structure, write `ArcSwap`/`RwLock`, send a "Change Message" to internal actor/task
    -   If a certain type of change **Must** take effect by rebuilding protocol side state (e.g., Point update causes subscription key change needing subscription rebuild; or Device/Session lifecycle needs rebuild), suggest triggering "Reconnect Request/Rebuild Flow" inside driver, instead of synchronous blocking wait here

-   **2) Maintain Hot Path Concurrency Safety**
    -   `collect_data/write_point/execute_action` may happen concurrently with `apply_runtime_delta` (They are all handle entries).
    -   Recommended Pattern: **Snapshot + Atomic Replacement**
        -   Use `ArcSwap`/`watch` to hold "Point Snapshot/Subscription Config Snapshot/Planner Snapshot"
        -   `apply_runtime_delta` builds new snapshot and atomically replaces; hot path read-only snapshot, avoid holding lock for long time

-   **3) Follow "Incremental Update" instead of "Full Rebuild"**
    -   `PointsChanged` already gives added/updated/removed separately, prioritize local changes:
        -   added: Parse and add to Cache/Planner; (Subscription/Report Mode) Join subscription set and supplement callback required meta info
        -   updated: Update codec/transform/driver_config, and refresh Cache/Planner; If subscription key/filter strategy changes, trigger resubscribe or refresh callback snapshot
        -   removed: Remove from Cache/Planner/Session Table and clean up associated state; (Subscription/Report Mode) Cancel subscription, avoid continuing to report data of deleted points

**`Key Notes for Subscription/Report Scenario`**

In Report mode, driver usually has a long-running "Subscription Manager/Callback Thread/Reporting Actor". The core task of `apply_runtime_delta` is to keep these background components consistent with the latest model:

-   **Point Add (added)**: Convert point to protocol side subscription item (e.g., NodeId/IOA/Index), add to subscription manager; and initialize meta info required for reporting (point_id, data type, transform).
-   **Point Update (updated)**: At least consider three types of changes:
    -   **Subscription Key Change** (e.g., NodeId/Address/Register Range change): Must cancel old subscription first then subscribe new item
    -   **Decode/Transform Change** (datatype/scale/offset/negate etc.): Need to update conversion logic of callback path, otherwise "Value correct but semantics wrong"
    -   **Reporting Strategy Change** (e.g., change/always, deadband/sampling/filtering rules if carried by driver_config): Need to update filter/aggregator state
-   **Point Remove (removed)**: Must cancel subscription and clean up all associated states, avoid continuing to send data of deleted points from callback (This is the most common hidden bug).

Suggest making "Subscription Management" an internal actor, and providing two types of messages:

-   `UpdateSubscription { added, updated, removed }`: Only do subscription set incremental adjustment (Try to batch)
-   `UpdateSnapshot { new_snapshot }`: Atomically replace snapshot relied upon by callback processing (Point metadata/transform/routing)

**`Common Pitfalls`**
-   **Only update memory point table, but forget to update subscription set**: Manifests as added points not reporting, deleted points still reporting, or point_id not found in callback.
-   **Synchronously do I/O in `apply_runtime_delta`** (Cancel/Create subscription, Probe device capability etc.): Will block control plane into "Slow Path", easily dragging down driver in high frequency change or weak network environment.
-   **Protect all states with one big lock**: Hot path will be frequently blocked by runtime delta; suggest using snapshot/layered lock/actor messaging to reduce contention.

In a nutshell: `apply_runtime_delta` is the key entry to let driver "**Evolve Online**"; in Subscription/Report mode, it determines the constant consistency between your subscription/mapping set and point model.
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
    // Use Mutex to protect shared resources, pay attention to lock granularity
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
        
        // 1. Assemble packet
        // 2. Send request (With timeout)
        // 3. Receive response (With timeout)
        // 4. Parse data
        
        // Example: Encounter I/O error
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
        // 1. Downcast: Get driver specific Runtime structure
        let device = device.downcast_ref::<YourProtoDevice>()
            .ok_or(DriverError::ConfigurationError("Invalid device type".into()))?;
        let point = point.downcast_ref::<YourProtoPoint>()
            .ok_or(DriverError::ConfigurationError("Invalid point type".into()))?;

        // 2. Encode: Convert NGValue to protocol raw value/byte stream
        //    (Suggest implementing in codec module, handling type conversion, byte order etc.)
        // let raw_payload = codec::encode_write(value, point.data_type, point.address)?;

        // 3. Acquire Transport: Get connection
        let mut guard = self.transport.lock().await;
        let stream = guard.as_mut().ok_or(DriverError::ServiceUnavailable)?;

        // 4. Execute: Execute protocol write request (With timeout)
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
         
         // 2. Resolve Parameters: Convert generic parameter list to driver strongly typed parameters
         //    (SDK provides helper function downcast_parameters)
         let typed_params = ng_gateway_sdk::downcast_parameters::<YourProtoParameter>(params)?;
         
         // 3. Build Command: Build protocol command based on action definition and parameters
         // let cmd_frame = codec::build_action_frame(&typed_params)?;

         // 4. Execute
         // ... Get connection and send ...

         Ok(ExecuteResult {
             outcome: ng_gateway_sdk::ExecuteOutcome::Completed,
             payload: Some(serde_json::json!({ "status": "ok" })),
         })
    }
}
```

:::

#### 5.3.4 Best Practices

::: details `Hot Path Performance Checklist`
-   **Zero Copy First**: Try to parse on `&[u8]`/`Bytes`; avoid repeated `Vec::new()` in loop
-   **Preallocation**: `Vec::with_capacity(items.len())`, `HashMap::with_capacity(n)`
-   **Reduce Lock Contention**: Prioritize lock-free read (e.g., ArcSwap / watch), shorten critical section for necessary locks
-   **Batching**: Merge multiple points into as few protocol requests as possible (Planner)
-   **Concurrency Control**:
    -   RTU/RS-485: Usually must be single flight (Avoid bus conflict)
    -   TCP: Can use connection pool/concurrent in-flight, but respect device capability and gateway resources
> When developing driver, you need to abstract batch processing/merged request strategies into configurable Planner, and design default values to be "Conservative but not too slow".
:::

::: details `Correctly Handle Timeout, Retry and Backoff`
Driver side generally encounters two types of retries:

-   **Connection Lifecycle Retry (Handled by Gateway Kernel Supervision Loop)**
    Driven by `connection_policy.backoff` (Macro already injected policy into `SupervisorParams.retry_policy`).
    What driver needs to do: **Correctly classify errors** (Retryable vs Fatal).

-   **Protocol Request Level Retry (Use with Caution)**
    e.g., Retry once immediately after single read/write request timeout.
    Suggested Principles:
    -   Limit count (e.g., max 1-2 times)
    -   Backoff + jitter (Avoid storm)
    -   Only retry explicit transient errors (Timeout/Connection Reset), do not retry "Illegal Response/Protocol Error"
:::

::: details `Error Classification & Context (Retryable vs Fatal, Merging "Forbid unwrap/expect")`
Driver is the foundation of gateway stability. You need to classify errors into **Retryable** and **Fatal**, letting supervision loop make correct decision; meanwhile must ensure any I/O, parsing, type conversion returns via `Result`, **Strictly Forbid** `unwrap()` / `expect()` causing panic.

Suggest classifying errors into at least three layers (Defined from "System Action" perspective):

-   **Connection Level Fatal (Fail immediately, wait for config/environment fix)**
    -   Configuration Error: Required field missing, Type mismatch, Illegal port/address range, Point definition illegal
    -   Auth/Authorization Unavailable: Credential missing, Permission permanently rejected (e.g., 401/403 and explicitly unrecoverable)
    -   TLS Validation Failed: Certificate chain untrusted, Hostname validation failed, Certificate expired (Unless you explicitly support hot update credential/certificate, should be treated as Fatal)

-   **Connection Level Retryable (Hand over to supervision loop for backoff reconnect)**
    -   Network/Transport Transient Failure: `ConnectionRefused`, `ConnectionReset`, `BrokenPipe`, DNS temporary failure
    -   I/O Timeout: Connection establishment timeout, Read/Write timeout (Note distinction from protocol level timeout)
    -   Resource Transient Insufficiency: System load too high, Temporary resource shortage (Usually governed together with backpressure and rate limiting)

-   **Request/Response Level Error (Most should not trigger "Immediate Reconnect Storm")**
    -   **Protocol Timeout/No Response**: Generally retryable once (With backoff + jitter), consecutive failures escalate to Connection Level Retryable
    -   **Protocol Error/Illegal Response/Decode Failure**: Default **Fatal (For this request)**, usually should not retry immediately; need to output sufficient context for troubleshooting
    -   **Device Side Exception Response** (e.g., Protocol defined exception/error code): Default **Fatal (For this request)**; whether reconnect is needed depends on protocol and device behavior (Not needed in most cases)

Implementation Suggestion (Actionable, Auditable):

-   **Do not use panic to express "Unreachable"**: Any failure on driver boundary should be `Result::Err`, carrying context; `Option`/downcast use `ok_or(...)` / `ok_or_else(...)`.
-   **Error should be "Machine Judgable + Human Troubleshooting"**:
    -   Machine Judgment: Use clear error kind (Retryable/Fatal, Config/Transport/Protocol/Auth/Backpressure etc.)
    -   Human Troubleshooting: Supplement key context in error (List below)
-   **Error Context Field List (Recommend at least include)**:
    -   Business Location: `channel_id / device_id / point_id` (If available), driver name, target endpoint (IP:port / serial path / slave id)
    -   Protocol Location: function code, address, quantity, transaction id / sequence (If protocol has)
    -   Timing Location: timeout config value, attempt (Which attempt), elapsed (Time taken)
    -   Data Location: Response length, Expected length, CRC/Checksum info, (Optional) Truncated hex dump (Only in `trace` level and must limit length)
    -   Underlying Error Chain: io error, timeout error, decode error (Keep original error as source)

> Rule of Thumb: If you can't see "**Which device, Which link, Which request, Which protocol segment**" in log/error, then this error is equivalent to "Unobservable".
:::

::: details `Backpressure Boundary: Keep pressure outside driver boundary`
Gateway stability comes from "Explicit Backpressure Boundary". Driver needs to guarantee: When upstream (Collection schedule/Write request) increases, driver won't create tasks limitlessly, stack memory limitlessly, nor blow up device/link.

Recommended Backpressure Strategy (Priority Strong to Weak):

-   **Concurrency Limit (Hard Boundary)**: Set `max_in_flight` for each connection/device (Typical implementation `Semaphore`).
    -   RTU/RS-485: Usually must be **`max_in_flight = 1`** (Avoid bus conflict and maintain timing)
    -   TCP: Can be appropriately increased, but must respect device capability and gateway resources (CPU/Memory/Bandwidth)

-   **Bounded Queue (Memory Boundary)**: Collection/Write requests must enter **Bounded** buffer (bounded channel/queue).
    -   Strategy when queue full must be clear: **Reject (Return Backpressure) / Coalesce / Discard Expired Read**, avoid "Seemingly successful but actually piling up".

-   **Batching and Merging (Reduce Request Count)**: Planner should prioritize merging multiple points into fewer protocol requests; when backpressure appears, prioritize increasing merging intensity, rather than increasing retry count.

-   **Timeout and Cancellation (Prevent Zombie Request)**
    -   Every I/O must have timeout; Task should support cancellation (e.g., shutdown signal / `select!` branch)
    -   When upstream cancels or times out, driver must not continue writing back result (Avoid "Expired Data Backfill")

Observability Suggestion:

-   **Backpressure Must Be Observable**: Record backpressure trigger count, rejection count, queue length/wait time (Note avoiding high cardinality fields).
-   **Backpressure Error Should Be "Retryable But Need Slow Down"**: Upstream seeing Backpressure should reduce frequency/concurrency, not immediate retry storm.
:::

::: details `TLS / Credentials / Logging: Security & Operability Baseline`
Once driver involves network (TCP/TLS/HTTP/MQTT bridge etc.), security and operability are "Default Requirements", not bonus items.

-   **TLS (Suggest based on rustls/system trust store)**
    -   Must enable certificate validation and hostname validation; **Forbid** disabling validation just to "Connect successfully"
    -   Support custom CA (Enterprise Intranet/Self-signed), Certificate Rotation (Update without restart is bonus)
    -   If using mTLS: Client certificate/private key missing or invalid should report error explicitly (Viewed as Fatal in most scenarios)
    -   TLS error log should be troubleshootable but not leak secrets: Output failure reason and certificate summary info only (e.g., subject/issuer/validity), do not output private key or full certificate content

-   **Credentials**
    -   Treat token/password/private key as secret: Do not write to log, do not `Debug` print, do not splice in error string
    -   Suggest explicit redaction for sensitive fields: e.g., keep only first/last 2-4 chars, replace rest with `***`
    -   Error message can contain conclusion "Credential Missing/Invalid", but cannot contain credential itself

-   **Logging (tracing)**
    -   Structurally record key events: Connection establish/disconnect, Reconnect backoff, Request timeout, Protocol exception, Backpressure trigger
    -   Record enough context (device/channel/endpoint/request), but avoid high cardinality (Do not use point value, full payload, random id as fields)
    -   Raw payload (hex dump/json) only allowed in `trace` level, must limit length, and must confirm not containing credential/privacy data
    -   Use `warn` for "Expected Transient Errors" (e.g., short timeout); Use `error` for "Unrecoverable/Need Manual Intervention" errors
:::

## 6. Observability

### 6.1 Logging (tracing) Best Practices

NG Gateway kernel will do the following when loading driver:

-   Register host log sink (`ng_driver_set_log_sink`)
-   Initialize driver tracing (`ng_driver_init_tracing`)
-   Support dynamic log level setting (`ng_driver_set_max_level`)

Therefore driver side should follow:

-   Use `tracing::info!`, `warn!`, `error!` to record key events.
-   `debug!`, `trace!` used for dev debugging and hot path, usually closed in production.
-   Log fields should be structured and carry context: `tracing::info!(channel_id=?, device_id=?, ...)`

### 6.2 Metric (Observer) Usage Principles

-   **SDK automatically collects basic metrics like connection status, collection frequency.**
-   **Driver only needs to care about data plane byte metering via `transport_meter`**
    -   Use SDK provided metered connection/wrapper (e.g., `connect_tcp_metered_with_timeout` / `connect_serial_metered` / `MeteredStream`) to let read/write automatically meter; do not handwrite byte counter in business loop (Easy to miss/miscalculate, also pollutes hot path).

## 7. lib.rs Export ABI Factory

```rust
use ng_gateway_sdk::ng_driver_factory;
use crate::connector::YourConnector;
use crate::metadata::build_metadata;
use crate::converter::YourConverter;

ng_driver_factory!(
    name = "YourProto",
    description = "Driver for Your Protocol",
    driver_type = "your-proto", // Global Unique Identifier
    component = YourConnector,
    metadata_fn = build_metadata,
    model_convert = YourConverter 
);
```

## 8. Testing Strategy

### 8.1 Unit Test

-   codec: Byte order/Word order, Type conversion, Boundary value, Illegal data tolerance
-   planner: Batch merge algorithm, Span limit clamp, Gap strategy
-   model convert: Config validity, Default value, Illegal input error semantics

### 8.2 Integration Test

-   Start Simulator
-   Write test cases, connect simulator via `Connector`, verify:
    -   Normal read/write path
    -   Timeout, Disconnect, Reconnect
    -   Concurrency pressure (Verify backpressure and memory limit)

### 8.3 Performance Benchmark

Repository already has `ng-gateway-bench` (Can refer to its Modbus bench entry):

-   codec micro-bench (ns/op per decode)
-   planner bench (Point scale scaling: 1k/10k points)
-   end-to-end bench (Collection → Northward Output)

## 9. Debugging and Release

### 9.1 Complete Process

1) Start Backend (Suggest debug + skip UI build, speed up iteration)
   - See: [`Local Development`](/dev/local-dev)
2) Start WebUI (Recommend dev server integration with backend)
3) Complete **Driver Install → Probe → Enable** in WebUI
   - Focus on: Version info, `api_version`/`sdk_version`, Architecture and Checksum match expectation
4) Create and Configure **Channel/Device/Point/Action** in WebUI
   - Run through with minimal usable configuration first (Can connect, Can collect/Write back)
5) Observe and Troubleshoot (Only look at "Low frequency, Aggregatable" key signals)
   - Is failure classification stable (`error_code/error_summary`)
   - Are `FailurePhase` and Reconnect Reason (`try_request_reconnect(reason)`) low cardinality/statistic-able
   - Throughput/Latency aggregated by "Batch/Count" (Strictly forbid per-point)

### 9.2 Release and Compatibility Checklist

-   **Multi-platform Artifacts**: Linux/macOS/Windows extensions differ (`.so/.dylib/.dll`), and ensure target architecture matches
-   **WebUI Probe Must Pass**: Ensure exported metadata readable, Type/Name/Version correct, and Probe info displayable
-   **Custom Driver Upgrade Method**: Install overwrite via WebUI after releasing new version artifact, and confirm `version/checksum` updated in probe page (File persists in `drivers/custom`)
-   **ABI/API Version**: Loader validates `ng_driver_api_version` consistent with host
-   **SDK Version**: Current policy is non-strict (Warn if inconsistent), but not recommended to cross major versions
-   **Config Compatibility**: Schema path and config fields keep backward compatible; New fields must provide default values

## 10. Common Pitfalls

-   **Doing I/O in `Connector::new()`**: Causes startup phase blocking, and violates SDK contract (Future may reject directly)
-   **Putting string address/expression parsing in hot path**: Throughput drops significantly, and harder to troubleshoot
-   **Error classification too coarse**: All errors Retryable leads to meaningless retry storm; All errors Fatal leads to hang on transient fluctuation
-   **RTU Mis-concurrency**: RS-485 bus concurrent write/read may cause device exception or serial driver chaos
-   **Missing Backpressure Strategy**: Memory bloats rapidly when Collection Speed > Processing Speed (Even with bounded channel, may pile up in driver internal buffer)

## 11. Key Demo Code Explanation

### 1) Converter: Where do field-level constraints take effect?

Taking Modbus point as example, converter enforces field existence and range validity during runtime conversion phase:

-   `functionCode` must exist and be number, and map to legal enum
-   `address` must exist and be in `u16` range
-   `quantity` defaults to 1, and forced >=1

This ensures hot path does not need repeated validation for every collection (Significant performance and stability gain).

### 2) Connector: How to land TCP/RTU "Connection Pool Strategy"?

Modbus `connect_pool()` does two production-mandatory things:

-   **TCP**: Establish pool by `tcpPoolSize`, and clamp to 1..=32 (Avoid config blowing up PLC/Gateway)
-   **RTU**: Force single flight (pool size=1), guarantee serial bus semantics

And: connect process respects `ctx.cancel`, avoiding shutdown hang.

### 3) Session: Ready definition should be "Clear, Low Cost"

Modbus has no complex handshake, session Ready definition is "Connection/Connection Pool established and available". Therefore:

-   `Session::init()`: Inject reconnect handle + pool into data-plane handle (**Dependency of publish handle**)
-   `Session::run()`: Wait for cancel; disconnect all contexts on exit (With timeout)

This is a very good "Attempt Resource Boundary" pattern, your new driver can directly reuse this structure if needed.

### 4) Handle: How does Timeout/Transport Error trigger reconnect?

Core of Modbus handle is `run_op()`:

-   Use `tokio::time::timeout` to set upper limit for each protocol operation (Avoid infinite wait)
-   When capturing transport error / timeout:
    -   Record structured warn
    -   `try_request_reconnect(...)` (**Do not await**, avoid blocking hot path)
    -   Return diagnosable error to upper layer

This quickly isolates "Weak Network/Device Occasional Exception" from hot path, and lets supervision loop unify governance of reconnection and backoff.
