---
title: 'Siemens S7'
description: 'NG Gateway Siemens S7 Southward Driver Usage & Configuration: CPU/TSAP/PDU Negotiation, S7 Address Syntax, Data Type Mapping, and Best Practices.'
---

## 1. Protocol Introduction

Siemens S7 protocol (Commonly S7Comm over ISO-on-TCP, port 102) is a protocol launched by Siemens, mainly used for communication with Siemens S7 series PLCs, widely used for variable reading/writing of S7-200/300/400/1200/1500/LOGO and other PLCs.

NG Gateway S7 driver connects to PLC as a **Client**, reading/writing PLC memory areas (I/Q/M/DB/T/C etc.) via address expressions.

## 2. Configuration Model

### 2.1 Channel Configuration

Channel is a PLC connection session boundary: **One Channel corresponds to one PLC (or one network entry of a PLC)**.

#### 2.1.1 `cpu` (CPU Type)

Used to select handshake/parameter differences and default TSAP strategy:

-   S7200 / S7200Smart / S7300 / S7400 / S71200 / S71500 / Logo0BA8

::: tip Suggestion
Try to select the real CPU model; wrong selection may lead to handshake failure or read/write exceptions.
:::

#### 2.1.2 `host` / `port`

-   **`host`**: PLC IP/hostname (Excluding schema)
-   **`port`**: Default `102`

#### 2.1.3 `tsap.kind` (TSAP Mode)

S7 connection requires TSAP (Transport Service Access Point) parameters. The driver provides two ways:

-   **`rackSlot`**: Derive TSAP from `rack` + `slot` (Most common)
-   **`tsap`**: Manually specify `src/dst` TSAP (More common when adapting to third-party devices/gateways)

Fields:

-   `tsap.rack`: Rack (Default 0)
-   `tsap.slot`: Slot (Default 1)
-   Or `tsap.src` / `tsap.dst`: 0..65535

::: tip Best Practice
-   **When to use rack/slot**:
    -   S7-1200/1500: Usually rack=0, slot=1 (Slot may differ for some models)
    -   S7-300/400: Depends on rack structure and CPU slot

-   **When to use explicit TSAP**:
    -   Forwarding S7 via third-party gateway (e.g., some industrial gateways)
    -   Field peer TSAP is known, and rack/slot derivation is unreliable
:::

#### 2.1.4 PDU/AMQ Negotiation Parameters (Advanced Tuning)

The driver allows specifying "Desired Negotiation Values" to reduce round trips and improve throughput in high point volume scenarios:

-   **`preferredPduSize`**: Desired PDU size (Default 960, Allowed 128..8192)
-   **`preferredAmqCaller`**: Desired AMQ Caller (Default 8, Allowed 1..255)
-   **`preferredAmqCallee`**: Desired AMQ Callee (Default 80, Allowed 1..255)

::: tip Best Practice
-   If you are unsure about PLC support capability, keep default (Let PLC decide).
-   When there are many points and frequent read/write, you can gradually increase `preferredPduSize` (e.g., 960→2048) and observe failure rate and average response time.
:::

### 2.2 Device Configuration

S7 driver's device driver configuration is empty.

::: tip Modeling Suggestion
-   When one Channel corresponds to one PLC, usually only one Device is needed (Representing that PLC).
-   If you wish to do "Business Grouping" for the same PLC (e.g., split point collections by production line/section), you can create multiple Devices (Logical Grouping), but they share the same connection session.
:::

:::: tip Grouped collection
When multiple business Devices exist under the same Channel, S7 driver will enable **grouped collection**: Collector will merge points of these Devices into one `collect_data(items)` call, driver reads all addresses in one batch read, then splits into respective `NorthwardData` outputs by `device_id`.
::::

### 2.3 Point Configuration

Point driver configuration fields:

-   **`address`**: S7 Address Expression

### 2.4 Action Configuration

Action is used to encapsulate a set of "Write Variable" operations; **Action itself does not carry protocol detail configuration**.

-   **Key Semantics**: S7 write target address should be configured on **Action's `inputs(Parameter)`**, i.e., each parameter specifies the S7 address expression to write via `Parameter.driver_config.address`.
-   **Why Design This Way**: An Action often needs to write multiple variables (multiple addresses), Action is just an abstraction of "Operation Set"; truly configurable and extensible protocol fields must fall on Parameter itself.

Parameter-level driver configuration fields (Each input parameter):

-   **`address`**: S7 Address Expression

::: warning Note
Address syntax is critical, see [S7 Address Syntax](./addressing.md).
:::

## 3. Data Type Mapping Table

This chapter tells you: **How to choose Point's `data_type` / Action Parameter's `data_type`**, to ensure "Write in and read back correctly, consistent value range, no implicit truncation/overflow".

::: tip Important
S7 driver derives `transport_size` (Transport Size/Underlying Type) from address expression when writing, then converts `NGValue` to corresponding S7 type. Therefore **`address → transport_size` determines real storage type**, `data_type` determines the type exposed/validated on gateway side. Both should align semantically as much as possible.
:::

| S7 transport size (Derived from address) | Bit Width/Length | Recommended DataType | Description |
| :--- | :--- | :--- | :--- |
| Bit | 1 bit | Boolean | Most recommended; Write by bool semantics |
| Char | 1 byte | String / UInt8 | `String` takes first char; also can use numeric (0..255) to write char code |
| Byte | 8 bit | UInt8 (Or Binary/Int8) | `Binary` for "Raw Bytes"; otherwise recommend UInt8 |
| Word | 16 bit | UInt16 | Unsigned 16-bit |
| Int | 16 bit | Int16 | Signed 16-bit |
| DWord | 32 bit | UInt32 | Unsigned 32-bit |
| DInt | 32 bit | Int32 | Signed 32-bit |
| Real | 32-bit float | Float32 | IEEE754 float32 |
| Counter | 16 bit | UInt16 | Counter commonly unsigned; Int16 if agreed by field |
| String | N bytes | String | Write requires string; Read path can also parse as Timestamp per RFC3339 (Optional) |
| WString | N bytes | String | Similar to String (Wide String) |
| Date | date | Timestamp / String | Recommend `Timestamp` (i64 ms) or `String` |
| DateTime / DateTimeLong | datetime | Timestamp / String | Recommend `Timestamp(ms)`; also can use Int64/UInt64 for epoch ms |
| TimeOfDay | time | Timestamp / String | `Timestamp` represents ms of day (0..86399999) |
| Time / S5Time / Timer | duration | Timestamp / String | `Timestamp` represents duration ms |
