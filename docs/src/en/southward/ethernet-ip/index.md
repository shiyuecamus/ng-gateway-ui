---
title: 'Ethernet-IP'
description: 'NG Gateway Ethernet/IP Southward Driver: Connection/slot/timeout configuration, Tag modeling, Data Type mapping and limitations (Array/Structure).'
---

## 1. Protocol Introduction and Common Scenarios

EtherNet/IP (Industrial Protocol) is an industrial automation network protocol developed and maintained by ODVA (Open DeviceNet Vendor Association), helping to achieve automated control and data exchange between devices, such as manufacturing, energy, transportation logistics, construction, etc.

NG Gateway Ethernet/IP driver connects to PLC as a client and reads/writes by Tag name.

## 2. Configuration Model

### 2.1 Channel Configuration

-   **`host`**: PLC Address (IPv4/hostname)
-   **`port`**: Default 44818
-   **`timeout`**: Request timeout (ms, default 2000)
-   **`slot`**: Slot number (Default 0)

::: tip
Slot semantics depend on PLC model/rack structure; if unsure, keep default and verify read/write with a known Tag.
:::

### 2.2 Device Configuration

Driver layer device configuration is empty (device used for logical grouping).

:::: tip Grouped collection
When multiple business Devices exist under the same Channel, Ethernet/IP driver will enable **grouped collection**: Collector will merge points of these Devices into one `collect_data(items)` call, driver will merge Tags to execute batch read (chunked batch read), then split into respective `NorthwardData` outputs by `device_id`.
::::

### 2.3 Point Configuration

-   **`tagName`**: Tag Name (Required), e.g.:
    -   `MyTag`
    -   `Program:Main.MyTag`

### 2.4 Action Configuration

Action is used to encapsulate a set of "Write Tag" operations; **Action itself does not carry protocol detail configuration**.

-   **Key Semantics**: Ethernet/IP write target Tag must be configured on **Action's `inputs(Parameter)`**, i.e., each parameter specifies the Tag to write via `Parameter.driver_config.tagName`.
-   **Why Design This Way**: An Action often needs to write multiple Tags (e.g., issue multiple set points at once), Action is just an abstraction of "Operation Set"; truly configurable protocol fields must fall on Parameter itself.

Parameter-level driver configuration fields (Each input parameter):

-   **`tagName`**: Tag Name (Required), e.g., `Program:Main.MyTag`

## 3. Value Type Conversion

-   **Read (uplink)**: `PlcValue` returned by PLC will first be decoded by Point's **wire data type**, then apply Point's **logical data type + Transform** (`transformDataType/transformScale/transformOffset/transformNegate`) to output `NGValue`.
-   **Write (downlink)**: Value issued by northward is treated as **logical value**, core will first execute logical→wire (including Transform inverse), driver then encodes as `PlcValue` to write to PLC according to wire data type.

::: tip Recommended Reading
For full link of Transform, non-numeric limits, value range consistency of min/max, see:
[Data Types and Transform Configuration](../data-types-transform.md).
:::

::: tip Explanation
Gateway side will try its best to convert according to `data_type`, but **PLC side will still check Tag's real CIP type**. Therefore, when `data_type` is chosen wrongly, writing may still fail (Type mismatch/Out of bounds/Truncation, etc.).
:::

### 3.1 Scalar Type Recommended Mapping Table

This table gives "Least Pitfall" modeling choices: **Keep `data_type` consistent with PLC Tag's real type** (Most stable for both read and write).

| PLC Tag Type (CIP) | Recommended DataType | Description |
| :--- | :--- | :--- |
| BOOL | Boolean | - |
| SINT | Int8 | - |
| INT | Int16 | - |
| DINT | Int32 | - |
| LINT | Int64 | - |
| USINT | UInt8 | - |
| UINT | UInt16 | - |
| UDINT | UInt32 | - |
| ULINT | UInt64 | - |
| REAL | Float32 | - |
| LREAL | Float64 | - |
| STRING | String | - |
| LINT (Unix epoch ms) | Timestamp | **Semantic Convention**: i64 millisecond timestamp; encoded as `LINT` on write |

::: tip
For complex types (Array/UDT/Structure) support status and alternative modeling strategies, see [Tag Modeling](./tag.md).
:::

### 3.2 Uplink Conversion Rules

::: tip Core Semantics
-   **Coercion by `data_type` (With Range Check)**: e.g., PLC returns `UDINT=42`, point declares `Int32`, will report `NGValue::Int32(42)`; if out of range (e.g., `UDINT > i32::MAX`), will report error and skip point.
-   **Scale/Offset/Negate by Transform (Read/Write Consistent)**: If you need engineering value semantics (e.g., scaled integer, zero offset), please use Point's Transform (Both uplink wire→logical and downlink logical→wire will take effect).
-   **Special Rules when PLC returns `STRING`**:
    -   `data_type=String`: Report string as is.
    -   `data_type=Boolean`: Parse by SDK rules (`true/false/1/0/on/off/yes/no/y/n/t/f`, ignore case and trim whitespace).
    -   `data_type=Timestamp`: Prioritize parsing RFC3339; otherwise parse string as "Numeric Timestamp" to epoch ms (With range check).
    -   Other Numeric Types: First `parse f64`, then output by logical data type + Transform.
:::

### 3.3 Downlink Conversion Rules

::: tip Core Semantics
-   **Cast + Range Check by `data_type`**: e.g., parameter declares `Int32`, input is `"123"` (String), will try to parse and write `DINT(123)`.
-   **Write will apply Transform's Inverse**: Northward writes logical value, written to PLC is wire value (Inversed).
-   **Conversion Failure returns ValidationError**: e.g., Out of bounds, NaN/Inf, Cannot parse string, etc.
-   **Compatible Input for Boolean** (When writing `data_type=Boolean`):
    -   `true/false`
    -   Numeric (0=false, Non-0=true)
    -   String (Same as uplink token rules)
:::

### 3.4 DataType Selection Suggestion

-   **First Priority: Align with PLC Tag Real Type**: This is the only solution for "Stable Read/Write". Gateway's cast/coercion is fault tolerance capability, not for arbitrary type mixing.
-   **Point (Read) can do coercion, but bear consequences**:
    -   e.g., PLC `UDINT` + `data_type=Int32`: Can report as long as value is within range; out of range will error and skip point.
    -   e.g., PLC `REAL` + `data_type=Int32`: Will truncate float to integer first, may lose decimals.
-   **Action Parameter (Write) must be more cautious**:
    -   Even if gateway can cast `"123"` to `DINT(123)`, if PLC Tag is `REAL` or `STRING`, PLC may still reject write due to CIP type mismatch.
    -   Conclusion: **Write `data_type` should strictly align with PLC Tag type**.
-   **Binary Support Status (Important)**:
    -   `Binary` currently not supported by driver (Field most common is `SINT[]/BYTE[]` array, while current underlying `PlcValue` only supports scalar and UDT, not array/byte string).
    -   Alternative modeling strategy see [Tag Modeling](./tag.md).
-   **Timestamp Best Practice**:
    -   `Timestamp` semantics fixed as **i64 milliseconds (epoch ms)**.
    -   Encoded as PLC `LINT` on write.
    -   Not recommended to use `ULINT` to carry timestamp: Exceeding `i64::MAX` will be judged as illegal timestamp and conversion fails.

::: tip Best Practice
-   If your PLC has UDT/Structure/Array: Suggest providing "Scalar Mirror Tag" on PLC side (Split members into independent Tags), or providing mapping node on PLC/OPC Server side; current version driver will error on complex types.
-   Verify read/write path and `slot` semantics with a "Simple Scalar Tag" (e.g., `DINT` counter) first, then model in bulk.
:::

### 3.5 Common Failure Modes and Troubleshooting

-   **Unsupported PlcValue type ...**
    -   **Meaning**: PLC returned complex type (e.g., UDT/Structure/Array), current driver cannot map to `NGValue`.
    -   **Handling**: Provide scalar mirror Tag on PLC/Server side as suggested in [Tag Modeling](./tag.md), then model on gateway side.
-   **typed conversion failed ...**
    -   **Meaning**: Read path wire→logical conversion failed (Common causes: Out of bounds, String cannot parse to Number/Bool, Timestamp out of bounds, Transform constraint not met).
    -   **Handling**: Check if wire/logical types align; Check Transform config (Especially scale=0, non-numeric mapping, huge integer + non-identity Transform).
-   **write value cast failed ... / ValidationError**
    -   **Meaning**: Cast failed before write (Out of bounds, NaN/Inf, String cannot parse, etc.).
    -   **Handling**: Check Parameter/Point `data_type` and input value; Input numeric type instead of string if necessary.
-   **PLC side write failed (CIP type mismatch etc.)**
    -   **Meaning**: Gateway side conversion successful, but PLC rejected (Tag type mismatch, Permission/Run mode restriction, Out of bounds, etc.).
    -   **Handling**: Prioritize letting write `data_type` strictly equal PLC Tag type; Check Tag type and write permission/status in PLC tool side.
