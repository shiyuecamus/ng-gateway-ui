---
title: 'Southward Overview'
description: 'Overview of NG Gateway Southward System: Driver model, device connection, collection strategy, parsing fault tolerance, and performance best practices.'
---

# Southward Overview

The Southward System of NG Gateway is not just about "connecting devices", but an access layer designed specifically for **industrial field uncertainty**, **multi-protocol coexistence**, and **high-throughput acquisition**.

This document will help you build the correct mental model of the southward system and understand how data is collected, normalized, and enters the core pipeline and northward links.

## What is Southward

Southward is responsible for stably connecting "real-world devices/buses/controllers" to the gateway, and standardizing read/write results into unified `NorthwardData` to enter the core pipeline and northward. Its goal is **Reliable, Observable, Extensible, Performance First**.

::: warning Design Principle
**Southward only solves "how to connect, how to collect, how to encode/decode, how to tolerate faults"**; do not bind northward protocols, business rules, or platform differences in the driver.
:::

## Mental Model

-   **Driver**: Protocol adapter (Modbus/S7/OPC UA/IEC104...), responsible for connection management, protocol encoding/decoding, read/write semantics, and fault tolerance strategies.

-   **Channel**: A "running instance" of a driver. A channel binds a driver factory + a runtime configuration (connection strategy, collection strategy, etc.), and mounts multiple devices under it.
    Channel is the **boundary of connection and session**: Different field lines/PLCs/servers of the same protocol are usually isolated by different channels.

-   **Device**: A collection object under a channel (Site/PLC/Meter/Node). The `device_type` of a Device is used by the driver for model selection/differentiated parsing.

-   **Point**: A data point (telemetry/attribute) under a device, carrying meta-information such as point type, data type, access mode (ReadOnly/WriteOnly/ReadWrite), and unit/range/scale. The `key` of a Point is the external stable identifier, and `id` is the internal high-frequency hot path primary key.

-   **Action**: A command/RPC definition under a device (e.g., "Close/Open/Reset/Write Parameter"). The `command` of an Action is the command name recognized by the driver, and input parameters are described by `Parameter` (Type/Required/Default/Range).

## Polling vs Driver Push

Currently, the gateway has exactly two data paths for "Southward → Core → Northward"; both paths **completely reuse the same forwarding/routing link** after entering the core.

### 1. Polling (Scheduled by Collector)

-   **Applicable Scenarios**: Protocols dominated by "read register/read variable" like Modbus/S7; or field requirements for fixed-period collection.
-   **Trigger Mechanism**: Only when `collection_type == Collection` of a channel, the channel will be pulled up by `Collector` for polling tasks; `period` determines the tick cycle.
-   **Core Link**:
    -   `Collector` ticks by channel → Pulls device/points → Physically groups by `driver.collection_group_key()` (within the same driver instance)
    -   Each group: Calls `driver.collect_data(items_in_group)` (Batch collection)
    -   Returns `Vec<NorthwardData>` (Still output by business device) → Sends one by one to core's **bounded mpsc** (Data forwarding queue)
    -   `Gateway` forwarding task `recv` from queue → Broadcasts to realtime hub → `NorthwardManager::route` (Snapshot/Change filter + Route to apps by "Northward app subscription")

::: tip Key Semantics
The "Scheduler" of Polling is the core's `Collector`, and the driver only implements "how to efficiently read points and parse".
:::

#### 1.1 Semantics of Grouped collection

::: warning Strongly Recommended
Treat this subsection as an "overview entry". For detailed design, concurrency/timeout semantics, and actual usage of each driver, please read:
[Group Collection Design and Driver Usage](./group-collection.md).
:::

Grouped collection (also known as **Group Collection**) is used to solve a common modeling scenario: **Under the same physical session/connection, points are split into multiple business Devices for business organization** (e.g., the same PLC / same OPC UA endpoint, or same Modbus slave is split into multiple business devices).

`Collector` calls `collection_group_key(device)` provided by the driver to decide "which business Devices should be merged into the same batch `collect_data(items)` call":

-   **`collection_group_key(device) -> None`**: No physical grouping. `Collector` guarantees `items.len() == 1` (Single device collection) for `collect_data(items)`.
-   **`collection_group_key(device) -> Some(key)`**: Do physical grouping. `Collector` merges multiple devices under the same `key` into one `collect_data(items)` call.

Where `key` is a fixed-size `CollectionGroupKey([u8;16])`, containing:

-   `kind` (4 bytes namespace, used for cross-driver isolation)
-   `payload` (12 bytes protocol custom payload, used to express "physical session semantics")

**Input Invariants** (Guaranteed by core):

-   `items` **is never empty** (Empty call is a bug).
-   If `collection_group_key == None`, then `items.len() == 1`.
-   If `collection_group_key == Some(key)`, then all devices in `items` belong to the same `key`.
-   `items` are constructed in ascending order of `device_id` internally to ensure stable behavior and ease of troubleshooting.

**Output Semantics** (Driver must obey):

-   Even if a call merges multiple devices for collection, the driver **must still output `NorthwardData` by business device** (Telemetry/Attributes' `device_id/device_name` cannot be confused).
-   Usually recommended: Use the same `timestamp` for the same group (Guarantee data consistency in this round).

### 2. Driver Push (Subscription/Report, Driven by Driver itself)

-   **Applicable Scenarios**: OPC UA subscription, IEC104 active upload, DNP3 SOE, asynchronous events/change reporting of any protocol.
-   **Trigger Mechanism**: Driver establishes subscription/listening/receive loop by itself after `start()`, and publishes directly when data is encountered.
-   **Core Link (By Implementation)**:
    -   When creating a driver, the gateway injects a `publisher: Arc<dyn NorthwardPublisher>` via `SouthwardInitContext`.
    -   Driver calls `publisher.try_publish(Arc<NorthwardData>)` in internal tasks (Non-blocking, backpressure via error return).
    -   Data enters the same core forwarding queue → forwarding task → `NorthwardManager::route` (Completely consistent with Polling).

::: tip Key Semantics
Subscription is not scheduled by `Collector`; it belongs to the "Session Layer/Protocol Layer" responsibility of the driver. Core only provides a high-performance publish entry and subsequent unified routing.
:::

## Reverse Path

The common goal of the reverse path is: **Perform "determinable" validation and rate limiting as close to the entrance as possible**, avoiding illegal/high-risk/flood requests hitting field devices directly.

### Point Write

-   **Entrance**: Northward plugin downlink event `NorthwardEvent::WritePoint`.
-   **Core Side Validation**:
    -   **NotFound**: point_id does not exist.
    -   **NotWriteable**: Point `access_mode` is not `Write/ReadWrite`.
    -   **TypeMismatch**: Write value does not match point `data_type`.
    -   **OutOfRange**: Numeric types only; when **both min_value and max_value exist**, perform interval validation on the write value.
    -   **NotConnected**: Belonging channel is not connected.
    -   **QueueTimeout**: Write serial queue of the same channel waits for timeout.
-   **Serialization & Concurrency Model**:
    -   **Strictly serial writes within the same channel** (Avoid out-of-order and state tearing caused by protocol/device not supporting concurrent writes).
    -   **Parallel between different channels** (Gateway throws WritePoint processing into independent tasks, fully utilizing multi-core and I/O concurrency).
-   **Execution**: Enter driver via `driver.write_point(device, point, value, timeout_ms)`.
-   **Response**: Return `NorthwardData::WritePointResponse` after write completion (Control plane response will not be discarded by "data backpressure").

### Action/Command

-   **Entrance**: Northward plugin downlink event `NorthwardEvent::CommandReceived`.
-   **Core Side Validation**:
    -   **NotFound**: action does not exist.
    -   **TypeMismatch**: Write value does not match point `data_type`.
    -   **OutOfRange**: Numeric types only; when **both min_value and max_value exist**, perform interval validation on the write value.
    -   **NotConnected**: Belonging channel is not connected.
    -   **QueueTimeout**: Write serial queue of the same channel waits for timeout.
-   **Execution**: Enter driver via `driver.execute_action(device, action, parameters)`.
-   **Response**: Return `NorthwardData::RpcResponse` after write completion (Control plane response will not be discarded by "data backpressure").

## Common Attributes

### Channel Common Attributes

| Field | Type | Description | Suggestion |
| :--- | :--- | :--- | :--- |
| `name` | `string` | Human-readable name (Preferred identifier for logs/monitoring/diagnostics) | Keep naming stable in production for easy troubleshooting |
| `driver_id` | `string` | Bound driver factory identifier | Consistent with installed driver |
| `collection_type` | `Collection \| Report` | Collection type: `Collection` will be polled by `Collector`; `Report` does not participate in polling, mainly relying on driver active Push (Subscription/Report) | Decided by protocol/field (Modbus/S7 commonly use `Collection`) |
| `report_type` | `Always \| Change` | Reporting strategy: `Always` full reporting; `Change` maintains device snapshot by core and filters changes (Reduces northward bandwidth and calculation) | High-frequency points recommend `Change` (combined with reasonable collection period) |
| `period` | `number` | Polling period (ms), only effective when `collection_type == Collection` | Set based on device capability and throughput budget |
| `status` | `boolean` | Enable/Disable. Disabled channel will not be started/polled/routed | Assess impact scope before changing |
| `connection_policy` | `object` | Connection and timeout/backoff strategy (Fields provided by core, used by driver at connection/read/write) | Recommend enabling backoff and limiting cumulative retry window for weak field networks |
| `driver_config` | `object` | Driver private configuration (Shape decided by driver, used for connection/session/protocol layer parameters, etc.) | Configure via driver's UI schema; avoid putting sensitive plaintext (like password/key) |

#### `connection_policy`

| Field | Type | Description | Suggestion |
| :--- | :--- | :--- | :--- |
| `connect_timeout_ms` | `number` | Connection establishment/session handshake timeout (Default 10000ms) | Appropriate amplification for poor field links |
| `read_timeout_ms` | `number` | Protocol read timeout (Default 10000ms) | Align with device response time |
| `write_timeout_ms` | `number` | Protocol write timeout (Default 10000ms) | Writes generally need to be more conservative |
| `backoff` | `RetryPolicy` | Unified exponential backoff strategy for reconnection/retry (Driver and northward plugin reuse the same model) | Avoid "Reconnection Storm/Thundering Herd" |

#### `connection_policy.backoff` (RetryPolicy)

| Field | Type | Description | Suggestion |
| :--- | :--- | :--- | :--- |
| `max_attempts` | `number \| null` | Max retry attempts; `0` means disable retry; `null` means infinite retry; setting to `N` means retry at most `N` times | Production recommends using limited times or limited duration |
| `initial_interval_ms` | `number` | Initial backoff interval (Default 1000ms) | 1000~3000 |
| `max_interval_ms` | `number` | Max backoff upper limit (Default 30000ms) | 30000~60000 |
| `multiplier` | `number` | Exponential multiplier (Default 2.0) | 2.0 |
| `randomization_factor` | `number` | Jitter factor (Default 0.2, represents ±20% jitter) | 0.1~0.3 |
| `max_elapsed_time_ms` | `number \| null` | Max cumulative retry duration (Default `null`, means unlimited; when set with `max_attempts`, the first one reached takes effect) | Recommended setting, e.g., 10~30 minutes |

### Device Common Attributes

| Field | Type | Description | Suggestion |
| :--- | :--- | :--- | :--- |
| `device_name` | `string` | Device name (Used for northward encoding and observability) | Align with field identifier |
| `device_type` | `string` | Device type/model (Used for driver to do model selection/differentiated parsing) | Should be stable as driver's "branch key" |
| `channel_id` | `string` | Belonging channel ID | Auto-generated is fine |
| `status` | `boolean` | Enable/Disable (Disabled device should be skipped at driver side and core routing side) | Gray release enable/disable facilitates troubleshooting |
| `driver_config` | `object \| null` | Device-level driver private configuration (Optional) | Used for differentiated parameters of this device; leave empty if no need |

### Point Common Attributes

| Field | Type | Description | Suggestion |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Point unique ID (Hot path primary key, preferred for change detection/snapshot index) | Internal use only |
| `device_id` | `string` | Belonging device ID | Auto-generated is fine |
| `name` | `string` | Point name (Human readable) | Align with field drawing/variable name |
| `key` | `string` | Point stable key (Preferred identifier for external reference/write back/topic routing) | **Must be stable**, avoid changes breaking integration |
| `type` | `Telemetry \| Attribute` | Point category | Model correctly according to usage |
| `data_type` | `string` | Value type (bool/i32/f64/string/...) | Consistent with protocol real value range |
| `access_mode` | `Read \| Write \| ReadWrite` | Access mode | Use it to express "Security Boundary" |
| `unit` | `string` | Display unit (e.g., ℃, kPa, A) | Keep it short; avoid string concatenation in hot paths |
| `min_value` / `max_value` | `number \| null` | Write range constraint (Only effective when both min and max exist) | Used for preventing accidental writes; keep consistent with value range |
| `transform_data_type` | `string \| null` | Parameter logical data type. If empty, logical=wire | Affects downlink input validation type |
| `transform_scale` | `number \| null` | Scale factor \(s\). Uplink wire→logical, Downlink logical→wire inverse transform | Downlink requires \(s != 0\) |
| `transform_offset` | `number \| null` | Offset \(o\) | Align with engineering zero point |
| `transform_negate` | `boolean` | Whether to negate (Order same as Point) | Used for opposite direction/sign flip |
| `driver_config` | `object` | Point-level driver private configuration (Protocol details like address/register/data block/subscription item) | Configure according to driver document; avoid writing protocol details into `key/name` |

#### Point Key Semantics

-   **Role of `access_mode`**:
    -   **Collection Side**: Core filters readable points (Read/ReadWrite) for collection according to `access_mode`; filters writable points (Write/ReadWrite) for write capability display/routing.
    -   **Write Side**: WritePoint entry uses it for strong validation; non-`Write/ReadWrite` will be directly rejected and return `NotWriteable`.
-   **`Read` is not "Protocol does not support writing"**: It is a **Security Boundary** at the product/field level; it should be configured correctly during the modeling phase to avoid accidental writing of critical points.
-   **`ReadWrite` Consistency Requirement**: Driver must guarantee semantic consistency (unit/scale/encoding) of read and write paths for the same address/variable.
-   **Value Range Consistency of `min_value/max_value`**: Current core range validation occurs in **logical value range** (Northward semantics). Therefore **min/max must be in the same value range as Northward input/output** (Engineering Value).
-   **Consistency Requirement of Transform**: Once `transformScale/transformOffset/transformNegate` or `transformDataType` is enabled, it must be guaranteed simultaneously:
    -   Uplink output and downlink write use the same set of logical semantics;
    -   `min/max` configured according to logical value range;
    -   Avoid applying Transform repeatedly within the driver (Double scaling will directly write wrong values).

### Action & Parameter Common Attributes

#### Action

| Field | Type | Description | Suggestion |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Action unique ID | Internal use only |
| `name` | `string` | Action name (Human readable) | Readable for OPS/Field |
| `device_id` | `string` | Belonging device ID | Auto-generated is fine |
| `command` | `string` | Command name recognized by driver (Protocol/Implementation related, but externally stable) | **Unique and stable within the same device** |
| `inputs` | `Parameter[]` | Input parameter definition list | Used for UI/Validation/Parsing |

#### Parameter

| Field | Type | Description | Suggestion |
| :--- | :--- | :--- | :--- |
| `name` / `key` | `string` | Parameter display name/stable key | key must be stable |
| `data_type` | `string` | Parameter type | Consistent with driver parsing |
| `required` | `boolean` | Whether required | Keep required parameters minimal |
| `default_value` | `any \| null` | Default value (If any) | Recommend providing default value for non-required |
| `min_value` / `max_value` | `number \| null` | Range constraint (If any) | Used for preventing accidental writes |
| `transform_data_type` | `string \| null` | Parameter logical data type. If empty, logical=wire | Affects downlink input validation type |
| `transform_scale` | `number \| null` | Scale factor \(s\). Uplink wire→logical, Downlink logical→wire inverse transform | Downlink requires \(s != 0\) |
| `transform_offset` | `number \| null` | Offset \(o\) | Align with engineering zero point |
| `transform_negate` | `boolean` | Whether to negate (Order same as Point) | Used for opposite direction/sign flip |
| `driver_config` | `object` | Parameter-level driver private configuration (Used for driver to do protocol layer mapping/encoding/enumeration, etc.) | Configure via driver schema; put only driver essential info |

#### Parameter Key Semantics (Core Unified Validation & Parsing)

-   **Parameter Structure**:
    -   Multi-parameter action: `params` must be a JSON Object (Value by `key`).
    -   Single-parameter action: Allows giving scalar directly, also allows giving `{key: value}`.
-   **Required and Default Value**:
    -   `required=true`: Must provide (Otherwise error).
    -   `required=false`: Allowed not to provide, but must have `default_value` (Otherwise error).
-   **Type Conversion (Try to be tolerant, but predictable)**: Will try to convert JSON scalar to target `data_type` (Including numeric string, bool string, timestamp, binary base64/hex and other common forms).
-   **Range Validation**: When Parameter declares `min_value/max_value`, interval validation will be performed on numeric input, and readable error information will be summarized and returned.

## Best Practices

### Backpressure and Queues

-   **publisher.try_publish is non-blocking**: When the core forwarding queue is full, it returns `QueueFull` (Backpressure signal). The driver must decide the strategy: Drop, Aggregate, Downsample, Retry (with backoff), instead of unbounded accumulation in the hot path.
-   **Batch Priority**: In Polling scenarios, the driver should try to form collection results into a small number of `NorthwardData` (e.g., grouped by device) to reduce sending times and scheduling overhead.

### Polling Collection

-   **Timeout/Retry/Backoff must be configurable**: Use timeout and backoff provided by `connection_policy`; continuous failure requires exponential backoff to avoid reconnection storms.
-   **Batch Read Strategy**: Split points into batches according to protocol capabilities (Upper limit/Alignment/Address continuity), and make batch size, concurrency, and timeout adjustable parameters.

### Subscription/Report (Subscription/Push)

-   **Subscription Loop must be cancellable**: Ensure quick exit during `stop()` (Cooperate with cancellation token/session lifecycle).
-   **Noise and Jitter Isolation**: Frequent change points should have sampling/throttling to avoid filling up northward/core queues.

### Parsing Fault Tolerance

-   **Parsing failure does not panic**: Bad frame/Partial packet/CRC error/Out of order must return actionable error semantics, carrying enough context (channel/device/address/counter).
-   **Recoverable Synchronization**: Bad frames should be discarded and frame headers re-synchronized; transient timeouts should be retryable; authentication failure/disconnection should trigger reconnection path.
-   **Error Grading**: Distinguish "Retryable/Need Reconnect/Non-retryable/Need Degrade", limiting "field noise" within this channel, not spreading to global.

### Runtime Change (RuntimeDelta)

The gateway supports adding, deleting, and modifying device/point/action during operation and notifying the driver (`RuntimeDelta`). Driver implementation should:

-   **Incrementally update local index**: Avoid full reconstruction;
-   **Ensure order and idempotency**: Delta within the same channel needs to be processed in order;
-   **Do not await while holding lock**: Structure updates should be as fast as possible, put I/O in background tasks.
