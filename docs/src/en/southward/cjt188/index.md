---
title: 'CJT188'
description: 'NG Gateway CJ/T 188 Southward Driver (Read-Only): Usage, Configuration, Runtime Semantics, Data Type Mapping, DI/field_key (Aligned with current implementation).'
---

## 1. Overview and Capability Boundary

CJ/T 188 is a common protocol for domestic water/heat/gas meters, common versions are **CJ/T 188-2004** and **CJ/T 188-2018**. Links are commonly two types: **RS-485 (Serial)** and **Serial Server to TCP**.

NG Gateway's CJ/T188 southward driver (`ng-driver-cjt188`) is a polling collection driver centered on **DI Schema Driven Parsing**.

:::: warning Important (Capability Boundary)
-   **Read-Only**: Driver does not support `execute_action` and `write_point` (Downlink not implemented), please do not configure any Action/Write Point capability for this driver.
-   **Active Collection Only**: Driver is used for `collection_type = Collection` scenario (Gateway schedules `collect_data` to initiate reading).
::::

## 2. Configuration Model

### 2.1 Channel Driver Configuration

#### 2.1.1 `version` (Protocol Version)

-   **`V2004`**
-   **`V2018`**

#### 2.1.2 `connection.type` (Connection Type)

-   **`Serial`**: Serial/RS-485 (Recommended for direct connection to 485 bus)
-   **`Tcp`**: TCP (Serial server/Gateway)

Serial Parameters (When `connection.type = Serial`):

-   **`connection.port`**: Serial port path
-   **`connection.baud_rate`**: Baud rate
-   **`connection.data_bits`**: Data bits (Default 8)
-   **`connection.stop_bits`**: Stop bits (Default 1)
-   **`connection.parity`**: Parity

TCP Parameters (When `connection.type = Tcp`):

-   **`connection.host`**: Host
-   **`connection.port`**: Port

#### 2.1.3 `max_timeouts` (Consecutive Timeout Trigger Reconnection)

This field directly drives "Timeout Trigger Reconnection" logic:

-   **`max_timeouts = 0`**: Disable "Consecutive Timeout Trigger Reconnection" (But **IO/Transport errors still trigger reconnection**)
-   **`max_timeouts > 0`**: When `Consecutive Request Timeout Count` > `max_timeouts`, driver requests supervisor to disconnect and rebuild session

:::: tip Suggestion
-   Not recommended to set `max_timeouts` to 1 (Prone to jitter reconnection), default 3 is usually more stable.
-   If field link jitter is high and device response is slow: Prioritize increasing `connection_policy.read_timeout_ms`, then increase `max_timeouts`.
::::

#### 2.1.4 `wakeup_preamble` (Preamble Wakeup Code)

`wakeup_preamble` is a `u8` array (Default `[0xFE, 0xFE, 0xFE, 0xFE]`). The driver will write this byte sequence to the link **before sending each CJ/T 188 frame**:

-   Suitable for some RS-485 meters that "Need 0xFE to wake up"
-   If explicitly not needed, can be configured as empty array `[]` to reduce bandwidth and write overhead

### 2.2 Device Driver Configuration

Key fields of Device `driver_config`:

-   **`meterType`**: Meter Type (T, 1 byte integer 0..=255)
    -   Decides **MeterTypeFamily**: Water/Heat/Gas/Custom
    -   MeterTypeFamily decides schema selection: Same DI may have different field structures in different families
-   **`address`**: 14-digit hex string, representing **A6..A0** (`High byte first`)
    -   Driver automatically converts to protocol wire order **A0..A6** (`Low byte first`)

### 2.3 Point Driver Configuration

-   **`di`**: 4-digit hex (2-byte DI, e.g., `901F`)
-   **`field_key`**: Field key in that DI schema (e.g., `current_flow`, `datetime`)

:::: tip Modeling Best Practice
One DI usually contains multiple fields (e.g., `901F` contains `current_flow`/`datetime`/`status` simultaneously):

-   **Multi-field Collection**: Create multiple Points, **same DI, different field_key**
-   **Performance**: Driver reads grouped by DI, only initiates one request for same device same DI, then distributes results to multiple Points (Reduce request count, higher throughput)
::::

## 3. Data Type Mapping Table

### 3.1 Schema DataFormat → "Source Scalar" Semantics

Codec layer first decodes bytes into a "Source Scalar" (decoded scalar), then produces final `NGValue` according to Point's `data_type + scale`.

| Schema DataFormat | Byte Semantics | Source Scalar Type | Remark |
| :--- | :--- | :--- | :--- |
| `BCD { decimals }` | BCD Numeric (With decimals) | `f64` | Decimals fixed by schema, Point does not configure decimals |
| `BCDInteger` | BCD Integer | `u64` | Suitable for count/work hours/date(day) etc. |
| `Binary` | Little Endian Unsigned Integer | `u64` | Used for bitset/enum/count etc. |
| `DateTime` | 7-byte BCD Time | `i64` | Output as epoch ms (UTC) |
| `Status` | 2-byte Status Bits (Little Endian) | `u64` | Semantics is `u16`, easy for bitwise parsing |
| `BCDWithUnit { data_length, decimals }` | BCD Numeric + 1-byte Unit Code | `f64` | Unit code currently not reported with value |

### 3.2 `data_type` Coercion Matrix

Driver follows unified rules for coercion of each field: **First get Source Scalar** (`f64/u64/i64`), **Apply scale** (If any), then produce final `NGValue` by `data_type`.

| Target `data_type` | Supported Source Scalar | Produced `NGValue` | Key Semantics |
| :--- | :--- | :--- | :--- |
| `Boolean` | `f64/u64/i64` | `Boolean` | `!= 0` treated as true |
| `Int8/Int16/Int32/Int64` | `f64/u64/i64` | Corresponding Integer | With `scale` will do round() and range check; Without `scale` `u64/i64` takes integer fast path (More precise) |
| `UInt8/UInt16/UInt32/UInt64` | `f64/u64/i64` | Corresponding Unsigned Integer | Same as above; `i64` to `UInt*` requires non-negative and representable |
| `Float32/Float64` | `f64/u64/i64` | Corresponding Float | With `scale` directly scales |
| `String` | `f64/u64/i64` | `String` | Numeric to String |
| `Binary` | `f64/u64/i64` | `Binary` | Numeric written to bytes in **Big Endian** (Only recommend for debug/passthrough, not as business value) |
| `Timestamp` | `f64/u64/i64` | `Timestamp` | Represents **epoch ms**; Source scalar (`i64`) produced by DateTime decoding recommended to configure `Timestamp` directly |

:::: warning Note
`Status` field semantics is `u16` bitset. Recommend `data_type=UInt16`, then split bitwise in Rule Engine/Northward side (e.g., Valve Switch, Battery Undervoltage, etc.).
::::

## 4. Supported DI / field_key

Driver built-in schema quantity is large (Contains massive range DIs), recommend understanding by "Meter Family + DI Range". Full list and explanation see `./address-di.md`, here gives overview:

-   **Water/Gas**
    -   `901F`
    -   `D120..D12B` (12 items)
    -   `D200..D2FF` (256 items)
    -   `D300..D3FF` (256 items, Timed Freeze)
    -   `D400..D4FF` (256 items, Instant Freeze)
-   **Heat**
    -   `901F`
    -   `911F`
    -   `D120..D12B`
    -   `D200..D2FF`
-   **Common (Universal for all meter families)**
    -   `907F`, `8102`, `8103`, `8104`, `8105`

## 5. Typical Modeling Examples

### 5.1 Water/Gas `901F`: Collect Cumulative, Time, Status Simultaneously

Recommend creating 3 Points (Same Device Same DI, Read only once):

-   `di=901F` + `field_key=current_flow` + `data_type=Float64` (Recommend `unit=m³`)
-   `di=901F` + `field_key=datetime` + `data_type=Timestamp`
-   `di=901F` + `field_key=status` + `data_type=UInt16`

### 5.2 Freeze Data `D3XX/D4XX`: Time + Cumulative + Instantaneous

Water/Gas freeze DI will produce `freeze_datetime` (Recommend `Timestamp`), `cumulative_flow`, `flow_rate`, `temperature`, `pressure` etc.; Recommend using `Float64` for numeric fields.

## 6. Troubleshooting

-   **No Data Read / Frequent Timeout**:
    -   Prioritize increasing `connection_policy.read_timeout_ms`
    -   Confirm serial parameters consistent with field; retain default `wakeup_preamble` if necessary
    -   Reasonably set `max_timeouts` (Too small causes jitter reconnection)
-   **Log "No schema found"**:
    -   Confirm `meterType` is correct (Meter Family decides schema selection)
    -   Confirm DI is within current implementation support range (See [`address-di.md`](./address-di.md))
-   **Log "Point value not produced"**:
    -   `field_key` might be misspelled, or does not belong to that DI/Meter Family
