---
title: 'DNP3'
description: 'NG Gateway DNP3 Southward Driver: TCP/UDP/Serial connection, Master/Outstation address, Integrity/Event Scan, Object Group/Index modeling and Data Type mapping.'
---

## 1. Protocol Introduction

DNP3 (Distributed Network Protocol) is commonly used in SCADA scenarios such as power and water utilities. It supports Integrity Scan and Event Scan, and can run over TCP/UDP/Serial.

NG Gateway DNP3 driver acts as **Master** communicating with Outstation:

-   Periodically execute Integrity Scan (Class 0/1/2/3)
-   Periodically execute Event Scan (Class 1/2/3)
-   Support some downlink commands (CROB/Analog Output/Restart, etc.)

## 2. Configuration Model

### 2.1 Channel Configuration

#### 2.1.1 `connection.type` (Connection Type)

-   **`serial`**: Serial/RS-485 (Recommended for direct connection to 485 bus)
-   **`tcp`**: TCP (Serial server/Gateway)
-   **`udp`**: UDP (Serial server/Gateway)

Serial Parameters (When `connection.type = serial`):

-   **`connection.port`**: Serial port path
-   **`connection.baud_rate`**: Baud rate
-   **`connection.data_bits`**: Data bits (Default 8)
-   **`connection.stop_bits`**: Stop bits (Default 1)
-   **`connection.parity`**: Parity

TCP Parameters (When `connection.type = tcp`):

-   **`connection.host`**: Host
-   **`connection.port`**: Port

UDP Parameters (When `connection.type = udp`):

-   **`connection.host`**: Host
-   **`connection.port`**: Port
-   **`connection.localPort`**: Optional, local UDP port

#### 2.1.2 Link Layer Address

-   `localAddr`: Master address (0..65519)
-   `remoteAddr`: Outstation address (0..65519)

#### 2.1.3 Scan and Timeout

-   `responseTimeoutMs`: Response timeout (Default 5000)
-   `integrityScanIntervalMs`: Integrity scan interval (Default 20000)
-   `eventScanIntervalMs`: Event scan interval (Default 1000)

### 2.2 Device Configuration

Driver layer device configuration is empty (device used for logical grouping).

### 2.3 Point Configuration

Points are located by "Object Group + Index":

-   `group`: Object Group (BinaryInput/AnalogInput/Counter/OctetString etc.)
-   `index`: Index (Starting from 0)

### 2.4 Action Configuration

Action is used to encapsulate a set of "Downlink Command" operations; **Action itself does not carry protocol detail configuration**.

-   **Key Semantics**: DNP3 command type and target index should be configured on **Action's `inputs(Parameter)`**, i.e., each parameter specifies the command and object index to issue via `Parameter.driver_config.group/index`.
-   **Parameterless Action**: Commands like `WarmRestart/ColdRestart` usually do not need value; you can create an Action with **empty inputs**, and use `Action.command` to represent the action semantics (driver will ignore value).

Parameter-level driver configuration fields (Each input parameter):

-   **`group`**: Command Type (`CROB` / `AnalogOutputCommand` / `WarmRestart` / `ColdRestart`)
-   **`index`**: Target Index (Required for `CROB`/`AnalogOutputCommand`; Ignored for Restart class)

::: tip
For details on group/index, see [Object Group/Index/Command Type](./groups.md)
:::

## 3. Data Type Mapping Table

### 3.1 Point (Uplink) Recommended Mapping

| Point group | Raw Value Type | Recommended DataType | Description |
| :--- | :--- | :--- | :--- |
| BinaryInput / BinaryOutputStatus (bool class) | bool | Boolean | Most recommended |
| AnalogInput (Analog) | f64 | Float32 / Float64 | Optional Int*/UInt* if integer needed, but watch for overflow and precision |
| Counter / FrozenCounter (Cumulative) | u64 | UInt64 (Or Int64) | Cumulative usually unsigned; select Int64 only if negative value agreed by field |
| OctetString | bytes | Binary / String | `String` will try UTF-8, fallback to Binary on failure |

::: warning Note
DNP3 has many object groups, for full list and modeling suggestions see [Object Group/Index/Command Type](./groups.md). The table above gives the most common and stable combinations.
:::

### 3.2 WritePoint (Downlink Write Point) DataType Selection

WritePoint only supports writing the following groups:

-   `BinaryOutput` → Uses `CROB` (Control Relay Output Block)
-   `AnalogOutput` → Uses `AnalogOutputCommand` (Group 41)

And the driver performs **Strict Type Validation** on `value` (Type mismatch directly rejected), so `point.data_type` must be selected correctly.

| Write Target (point.group) | Underlying Command | Recommended DataType | Value Description |
| :--- | :--- | :--- | :--- |
| BinaryOutput | CROB | UInt8 (Recommended) | **Only supports UInt8 Control Code**: Value must be selected from gateway allowed value table (See [`crob.md`](./crob.md)) |
| AnalogOutput | AnalogOutputCommand | Int16 / Int32 / Float32 / Float64 | DataType decides Group41 Variation (Var2/Var1/Var3/Var4) |

#### DataType to Group41 Variation Mapping (Key)

**Core Mechanism**: `DataType` directly determines the Variation used by DNP3 write command:

| DataType | DNP3 Variation | Protocol Meaning | Value Range |
| :--- | :--- | :--- | :--- |
| Int16 / UInt16 | Group41Var2 | 16-bit Analog Output | -32768 ~ 32767 |
| Int32 / UInt32 | Group41Var1 | 32-bit Analog Output | -2^31 ~ 2^31-1 |
| Float32 | Group41Var3 | Single-precision Float | IEEE 754 float |
| Float64 | Group41Var4 | Double-precision Float | IEEE 754 double |

::: tip Why no need to configure Variation?
NG Gateway adopts **Simplified Modeling** strategy, this design simplifies configuration, users do not need to understand protocol details, while ensuring protocol compatibility. See [DataType and Variation Mapping](./groups.md#_2-datatype-and-dnp3-variation-mapping-relationship).
:::

### 3.3 Action Parameter (Downlink Action Parameter) DataType Selection

Action Parameter follows same rules as WritePoint: Each parameter carries `group/index`, and parses value by its `data_type`.

-   `group=CROB`: Recommend `data_type=UInt8`, value as **CROB Control Code(u8)** (Select from gateway allowed value table)
::: warning Note
Value type is u8, but driver only accepts **48 explicit combinations** (Others will be rejected), see [`crob.md`](./crob.md).
:::
-   `group=AnalogOutputCommand`: value only supports `Int16/Int32/Float32/Float64` (Otherwise driver returns error)

#### 3.3.1 How to configure "Protocol Level Fields" of CROB Parameter?

To ensure **WritePoint is Simple and Safe**, WritePoint path **DOES NOT Provide** control capability for CROB's count/on/off etc. "Protocol Level Fields":
-   **WritePoint (BinaryOutput)**: Only supports issuing `value=ControlCode(u8)`, cannot control `crobCount/crobOnTimeMs/crobOffTimeMs`
-   **Action (CROB)**: Control `crobCount/crobOnTimeMs/crobOffTimeMs` via **Parameter Level** modeling fields (Thus different inputs within the same Action can configure different pulse timing and counts)
