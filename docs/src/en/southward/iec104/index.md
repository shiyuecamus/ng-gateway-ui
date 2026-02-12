---
title: 'IEC 60870-5-104'
description: 'NG Gateway IEC 60870-5-104 Southward Driver: Link/Session parameters, CA/IOA/TypeID modeling, Uplink parsing and Write command best practices.'
---

## 1. Protocol Introduction

IEC 60870-5-104 (IEC104 for short) is a common telecontrol protocol in power automation, based on TCP (default port 2404). It carries information objects like telesignaling/telemetry/integrated totals/events via ASDU (Application Service Data Unit), and supports commands like telecontrol/set point/general interrogation/clock synchronization.

NG Gateway IEC104 driver runs in **Single Channel Single TCP Session** mode, core data path is `Driver Push`:

-   Uplink (Telemetry/Telesignaling/Integrated Totals, etc.): Driver receives ASDU and pushes to northward link via publisher.
-   Downlink (Telecontrol/Set Point/Bit String, etc.): Trigger command sending via WritePoint or Action.

## 2. Configuration Model

### 2.1 Channel Configuration

#### 2.1.1 Basic Connection

-   **`host`**: Remote station IP/hostname
-   **`port`**: Port, default 2404

#### 2.1.2 Advanced Link Parameters (t0/t1/t2/t3/k/w)

Stability and throughput of IEC104 largely depend on link layer timers and windows:

-   **`t0Ms`**: Connection establishment/confirmation timeout
-   **`t1Ms`**: I-frame confirmation timeout (Wait time for unreceived confirmation)
-   **`t2Ms`**: S-frame confirmation aggregation timeout (Ack sending delay window)
-   **`t3Ms`**: Idle test frame interval (Keep link alive)
-   **`kWindow`**: Max unconfirmed I-frame window
-   **`wThreshold`**: Confirmation threshold (Trigger confirmation when reached)

There is also a set of "Queue and Backpressure" parameters:

-   **`sendQueueCapacity`**: Send queue capacity
-   **`maxPendingAsduBytes`**: Pending ASDU bytes limit (Backpressure/Memory budget)
-   **`discardLowPriorityWhenWindowFull`**: Discard low priority when window is full
-   **`mergeLowPriority`**: Merge low priority (Keep last value only)
-   **`lowPrioFlushMaxAgeMs`**: Low priority flush max delay
-   **`tcpNodelay`**: Disable Nagle (Reduce small packet latency)

> For advanced explanation and tuning suggestions, see `./link-timers.md`.

#### 2.1.3 Startup General Interrogation Parameters

-   **`startupQoi`**: Startup General Interrogation QOI (Default 20)
-   **`startupQcc`**: Startup Counter Interrogation QCC (Default 5)

### 2.2 Device Configuration

In IEC104, CA (Common Address) is used to distinguish stations/bays (defined by field). NG Gateway models **CA as Device-level configuration**:

-   **`ca`**: Common Address (1..65535)

::: tip Modeling Suggestion
-   If multiple CAs are carried under one TCP connection (Common in station/control center side), recommend creating one Device per CA for northward grouping and permission isolation.
-   Different IOA/TypeID under the same CA are modeled as different Points.
:::

### 2.3 Point Configuration

Point driver configuration fields:

-   **`ioa`**: Information Object Address (0..65535)
-   **`typeId`**: ASDU TypeID (Selected by Enum in UI)

> Key: Driver uses `(typeId, ioa)` as index to match uplink data, point is matched only when completely matched.

### 2.4 Action Configuration

Action is used to encapsulate a set of "Downlink Command" operations; **Action itself does not carry protocol detail configuration**.

-   **Key Semantics**: IEC104 downlink command target `(typeId, ioa)` must be configured on **Action's `inputs(Parameter)`**, i.e., each parameter specifies the command type and IOA to issue via `Parameter.driver_config.typeId` and `Parameter.driver_config.ioa`.
-   **Why Design This Way**: An Action often needs to issue multiple IOAs (e.g., issue multiple telecontrols/set points at once), Action is just an abstraction of "Operation Set"; protocol fields must fall on Parameter itself.

Parameter-level driver configuration fields (Each input parameter):

-   **`ioa`**: Information Object Address (0..65535)
-   **`typeId`**: Command Class TypeID (e.g., C_SC/C_DC/C_SE/...)

## 3. Data Type Mapping Table

After receiving ASDU, the driver decodes by TypeID, and uses `ValueCodec` to force convert raw value to Point declared `data_type` (Applying `scale` simultaneously).

| Uplink TypeID (Point typeId) | Raw Value Source | Raw Value Type | Recommended DataType |
| :--- | :--- | :--- | :--- |
| M_SP_* (Single Point) | `siq.spi()` | bool | Boolean |
| M_DP_* (Double Point) | `diq.spi().value()` | u8 (0..3) | UInt8/UInt16 (Or mapped by field convention) |
| M_BO_* (32bit String) | `bsi` | u32 | UInt32 |
| M_ST_* (Step) | `vti.value()` | i8/i16 (By implementation) | Int16 |
| M_ME_NA/ND (Normalized) | `value()` | f64 | Float32/Float64 |
| M_ME_NB (Scaled) | `sva` | i16 | Int16/Float32 |
| M_ME_NC (Short Float) | `r` | f32 | Float32 |
| M_IT_* (Integrated Totals) | `bcr.value` | i32/i64 | Int64/UInt64 |

## 4. Write/Downlink Command
-   **C_SC_NA_1 / C_SC_TA_1**: Single Command (Value should be convertible to bool)
-   **C_DC_NA_1 / C_DC_TA_1**: Double Command (Value should be convertible to u8)
-   **C_RC_NA_1 / C_RC_TA_1**: Step Command (Value should be convertible to u8)
-   **C_SE_NA_1 / C_SE_TA_1**: Set Point Normal (Value should be convertible to i16)
-   **C_SE_NB_1 / C_SE_TB_1**: Set Point Scaled (Value should be convertible to i16)
-   **C_SE_NC_1 / C_SE_TC_1**: Set Point Float (Value should be convertible to f32)
-   **C_BO_NA_1 / C_BO_TA_1**: Bits String 32 Command (Value should be convertible to i32)

Interrogation Class (Can be modeled as Action, no input value needed):

-   **C_IC_NA_1**: General Interrogation (Use `startupQoi`)
-   **C_CI_NA_1**: Counter Interrogation (Use `startupQcc`)

### 4.1 WritePoint / Action Parameter DataType Recommendation Table (Command Class TypeID → DataType)
::: tip
IEC104 write side performs strict type conversion on value, so **Point/Parameter `data_type` should be consistent with command expected type as much as possible**, avoiding implicit conversion failure.
:::

| Command TypeID | Recommended DataType | Value Used | Description |
| :--- | :--- | :--- | :--- |
| C_SC_NA_1 / C_SC_TA_1 | Boolean | ✅ | Single Command (bool) |
| C_DC_NA_1 / C_DC_TA_1 | UInt8 | ✅ | Double Command (u8, range per field convention) |
| C_RC_NA_1 / C_RC_TA_1 | UInt8 | ✅ | Step Command (u8) |
| C_SE_NA_1 / C_SE_TA_1 | Int16 | ✅ | Set Point Normal (i16) |
| C_SE_NB_1 / C_SE_TB_1 | Int16 | ✅ | Set Point Scaled (i16) |
| C_SE_NC_1 / C_SE_TC_1 | Float32 | ✅ | Set Point Float (f32) |
| C_BO_NA_1 / C_BO_TA_1 | Int32 | ✅ | Bits String 32 (i32) |
| C_IC_NA_1 | UInt8 (Any) | ❌ | General Interrogation: value ignored, but recommend defining a dummy parameter to trigger command (ioa can be 0) |
| C_CI_NA_1 | UInt8 (Any) | ❌ | Counter Interrogation: Same as above (ioa can be 0) |
