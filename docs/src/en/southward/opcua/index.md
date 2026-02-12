---
title: 'OPC UA'
description: 'NG Gateway OPC UA Southward Driver Usage & Configuration: Connection/Auth/Security Policy, Subscribe vs Periodic Read, NodeId Modeling, Data Type Mapping, and Best Practices.'
---

## 1. Protocol Introduction

OPC UA (OPC Unified Architecture) is a machine-to-machine communication protocol for industrial automation, maintained by the OPC Foundation. It provides a unified information model, extensible data type system, and built-in security mechanisms (Certificate, Encryption, Signing).

## 2. Configuration Model

### 2.1 Channel Configuration

Channel is the OPC UA session boundary: One Channel corresponds to one OPC UA Server (or one endpoint).

#### 2.1.1 Application Identity

-   **`applicationName`**: Client Application Name (Required)
-   **`applicationUri`**: Client Application URI (Required)

These fields participate in UA's application description and certificate/trust chain system (especially in certificate authentication mode).

#### 2.1.2 `url` (Endpoint URL)

::: tip Example
-   `opc.tcp://192.168.1.10:4840`
-   `opc.tcp://server-hostname:4840`
:::

#### 2.1.3 `auth.kind` (Authentication Mode)

-   **anonymous**: Anonymous (Most common)
-   **userPassword**: Username and Password
-   **issuedToken**: Issued Token (Token string)
-   **certificate**: Certificate mode (`privateKey` + `certificate`)

::: warning Note
Certificate content is usually stored as PEM string.
:::

#### 2.1.4 Security Policy & Security Mode

-   **`securityPolicy`**: e.g., None / Basic256Sha256 / Aes256Sha256RsaPss ...
-   **`securityMode`**: None / Sign / SignAndEncrypt

::: tip Best Practice
-   Production environment recommends at least `Sign`, preferably `SignAndEncrypt`.
-   If Server only opens certain policy/mode combinations, please align with Server's endpoint configuration.
:::

#### 2.1.5 Collection Mode: `readMode`

-   **Subscribe**: Driver creates Subscription + MonitoredItems, Server pushes changes (Recommended).
-   **Read**: Active Read by collection period (Suitable for few points or Server does not support subscription/limits subscription).

::: warning Note
Subscribe mode is more "Event Driven", more efficient for high-frequency changing points, but pay attention to subscription batch and keep-alive parameters.
:::

#### 2.1.6 Session & Keep-Alive Parameters

-   **`sessionTimeout`**: Session timeout (ms, default 30000)
-   **`keepAliveInterval`**: Keep-alive interval (ms, default 30000)
-   **`maxFailedKeepAliveCount`**: Max failed keep-alive count (Default 3)
-   **`subscribeBatchSize`**: Subscription batch size (Default 256)

::: tip Tuning Suggestion
-   When there are many points, appropriately increasing `subscribeBatchSize` can reduce create/modify request times, but too large may trigger server-side limits.
-   `keepAliveInterval` should not be too small (increases Server pressure), nor too large (slow fault detection); default value is usually a reasonable starting point.
:::

### 2.2 Device Configuration

OPC UA driver's device driver configuration is empty.

::: tip Modeling Suggestion
-   You can model "A production line/A section/A subsystem" as a Device for organizing points and northward topic routing.
:::

:::: tip Grouped collection
When OPC UA uses Read (Periodic Collection) mode, and there are multiple business Devices under the same Channel, OPC UA driver will enable **grouped collection**: Collector will merge points of these Devices into one `collect_data(items)` call, driver will merge NodeIds for one batch Read, then split into respective `NorthwardData` outputs by `device_id`.
::::

### 2.3 Point Configuration

-   **`nodeId`**: OPC UA NodeId string

### 2.4 Action Configuration

Action is used to encapsulate a set of "Write Node" operations; **Action itself does not carry protocol detail configuration**.

-   **Key Semantics**: OPC UA write target NodeId should be configured on **Action's `inputs(Parameter)`**, i.e., each parameter specifies the NodeId to write via `Parameter.driver_config.nodeId`.

Parameter-level driver configuration fields (Each input parameter):

-   **`nodeId`**: OPC UA NodeId string

::: tip
For NodeId format and selection method, see [NodeId Syntax](./nodeid.md).
:::

## 3. Data Type Mapping Table

### 3.0 Recommended Mapping Table

| UA Variant (Scalar) | Recommended DataType | Description |
| :--- | :--- | :--- |
| Boolean | Boolean | - |
| SByte/Byte | Int8/UInt8 | - |
| Int16/UInt16 | Int16/UInt16 | - |
| Int32/UInt32 | Int32/UInt32 | - |
| Int64/UInt64 | Int64/UInt64 | - |
| Float/Double | Float32/Float64 | - |
| String | String | Can also map to Timestamp (RFC3339) or Binary (hex string) |
| ByteString | Binary | - |
| DateTime | Timestamp | `Timestamp` semantics is **i64 milliseconds** |

### 3.1 Read Path

-   Numeric Variant (`SByte/Int16/Int32/Int64/Float/Double etc.`):
    -   First decode by wire data type, then convert wire→logical by logical data type + Transform.
-   `Variant::Boolean`: Same as above (Recommend logical as `Boolean`, avoid non-numeric mapping restrictions).
-   `Variant::String`:
    -   `DataType::String`: Output string directly.
    -   `DataType::Timestamp`: Try parsing RFC3339.
    -   `DataType::Binary`: Try parsing hex string.
-   `Variant::ByteString`: Recommend mapping to `Binary`.
-   `Variant::DateTime`: Recommend mapping to `Timestamp` or `String`.
-   `Variant::Array`: Not supported in current version, returns empty (Point will not produce value).

::: tip Important
If you need array/structure, suggest providing scalar nodes on Server side, or extending "Structure/Array" to JSON mapping capability on edge side.
:::

### 3.2 Write Path

When writing, force convert according to Point's `data_type` and generate Variant; `Timestamp` will be converted to UA `DateTime` (Write fails if timestamp is invalid).

:::: tip Best Practice
-   **Try to keep Point/Parameter `data_type` consistent with Server node's real type**, avoiding precision/range issues caused by implicit conversion.
-   If Server node is array/structure: Suggest providing scalar nodes on Server side, or extending "Structure/Array → JSON" capability on edge side; current version does not output array values.
::::
