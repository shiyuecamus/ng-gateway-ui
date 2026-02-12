---
title: 'Data Types (Wire vs Logical) & Transform Configuration'
description: 'Explain wire data type (protocol/memory layout semantics), logical data type (northward semantics) of points/parameters, and the complete uplink/downlink link, configuration method, impact scope, and common pitfalls of Transform.'
---

# Data Types (Wire vs Logical) & Transform Configuration

This chapter is one of the parts in the southward system that is **most easily misunderstood** but has the greatest impact on stability and correctness.

When you configure a Point or Action Parameter in the gateway, two "type" concepts must be distinguished clearly:

-   **wire data type (Protocol/Memory Layout Semantics)**: The **actual encoding method** of the protocol frame/register/variable on the field device, determining how the driver parses from bytes/registers and how to write back.
-   **logical data type (Northward Semantics)**: The **external semantic type** used by the gateway for external output (Uplink NorthwardData) and downlink validation/writing (WritePoint/ExecuteAction).

And now a unified **`Transform`** link is introduced, used to convert wire value to logical value (uplink), and inverse transform logical value to wire value (downlink).

---

## 1. Terminology & Core Conclusions

### 1.1 What is wire data type

**wire data type** is equivalent to `data_type` of Point/Parameter.

-   For Modbus: It describes "decoding method of register/coil in memory layout", e.g., `Int16`, `UInt16`, `Float32`, `Boolean`, etc.
-   For S7/MC/EtherNet/IP/OPC UA: It describes the protocol-level type the driver should use when encoding/writing back (e.g., target type used when OPC UA writes Variant).

::: tip In a nutshell:
**wire data type determines how the driver reads/writes bytes**.
:::

### 1.2 What is logical data type

**logical data type** is the gateway's external semantic type, calculated as:

-   If `transformDataType` (internal `transform_data_type`) is configured, then `logical = transformDataType`
-   Otherwise `logical = wire`

::: tip In a nutshell:
**logical data type determines the type seen by northward, and the type validated during downlink writing**.
:::

### 1.3 What is Transform

`Transform` is a composable lightweight rule (No allocation, Copy), currently supporting four fields:

-   `transformDataType?: DataType`: Logical type (Optional)
-   `transformScale?: number`: Scale factor \(s\) (Optional)
-   `transformOffset?: number`: Offset \(o\) (Optional)
-   `transformNegate: boolean`: Whether to negate (Default false)

Mathematical definition (For "Numeric Types"):

-   **Uplink (wire → logical)**: First perform affine transformation, then negate as needed
    -   Affine: `y = x * s + o`
    -   If `transformNegate=true`: `y = -y`
-   **Downlink (logical → wire)**: First negate as needed, then perform inverse transformation
    -   If `transformNegate=true`: `y = -y`
    -   Inverse: `x = (y - o) / s`

::: tip In a nutshell:
**Transform only defines "how to change value range from wire to logical (and vice versa)"**, it does not replace driver configurations like protocol address/register/subscription.
:::

---

## 2. Where exactly does Transform happen in Uplink/Downlink

Here we explain with the "factual link" — if you understand this section, you won't confuse scale/min/max/type.

### 2.1 Uplink: Field → Gateway → Northward

The goal of uplink is: **Stably output the protocol value (wire) of the field device as NGValue (logical) in NorthwardData**.

Typical steps are as follows:

1.  **Driver parses protocol payload to get wire value**
    -   Modbus: Decode by byte/word order from coil/register slice
    -   S7/MC: Decode by address type/transport size
    -   OPC UA: Read value from DataValue/Variant
    -   EtherNet/IP: Decode from PLC type value returned by tag read
2.  **Driver converts wire value to logical value**
    -   Recommended to use unified entry of SDK: `ValueCodec::wire_to_logical_value(wire_value, wire_dt, logical_dt, transform)`
    -   Or driver does equivalent "coerce + transform" logic itself (Internal codec of each driver might have encapsulated it)
3.  **Driver outputs NorthwardData (Organized by business device)**
    -   Note: Even if group collection is done during collection (see next chapter), it must be output by business device

::: warning Key Rules of Uplink

-   **logical_data_type determines the type of the final output NGValue**.
    For example, wire is `Int16`, logical is configured as `Float64`, the final uplink value will be `NGValue::Float64`.
-   **Transform's scale/offset/negate will truly affect the value in uplink**.
    For example, wire=100, scale=0.1 → logical=10.0
:::

### 2.2 Downlink: Northward → Gateway → Field

Downlink has two entries:

-   **WritePoint**: Write point
-   **ExecuteAction**: Execute action (Action parameter)

The goal of downlink is: **Let northward only care about logical semantics, and the gateway is responsible for reliably converting it to wire semantics and writing back to the device**.

Typical steps are as follows:

1.  **Core first performs "Logic Layer Validation"**
    -   Validate if `accessMode` allows writing (Write/ReadWrite)
    -   Validate if write value type matches **logical data type**
    -   Validate numeric range `minValue/maxValue` (If configured)
2.  **Core converts logical value to wire value**
    -   Unified entry: `ValueCodec::logical_to_wire_value(value, logical_dt, wire_dt, transform)`
    -   This step will execute **Transform's Inverse Transformation** (scale/offset/negate), and box the result into wire data type
3.  **Driver performs protocol encoding and writes back according to wire data type**

#### Key Rules of Downlink (Very Important)

-   **Values sent from northward are always treated as logical values** (Not wire values).
    This means: If you configured `transformScale=0.1` (wire→logical), then northward sends 10.0, the wire written to device will be 100 (Inverse transform).
-   **Range validation (min/max) happens in logical value range**.
    That is to say, `minValue/maxValue` should align with the "Engineering Value" seen by northward, not the register raw value.

---

## 3. How You Should Configure: Fields, Semantics, and "Writing Safely"

### 3.1 Fields on Point

Key fields of Point:

-   **`dataType`**: wire data type (Protocol/Memory layout semantics)
-   **`transformDataType`**: logical data type (Optional; if not filled, logical=wire)
-   **`transformScale` / `transformOffset` / `transformNegate`**: Transform parameters effective for numeric types

::: warning Important: Point's `dataType` is not equal to "Northward Output Type"
If you configured `transformDataType`, northward output and downlink validation will use `transformDataType`.
:::

### 3.2 Fields on Action Parameter

Each input parameter (Parameter) of Action also has the same Transform semantics:

-   **`dataType`**: parameter's wire data type (Type driver eventually wants to write into protocol)
-   **`transformDataType`**: parameter's logical data type (Type for Northward/Debug API input validation)
-   **`transformScale` / `transformOffset` / `transformNegate`**: Same as Point

---

## 4. Usage Scenarios

### 4.1 Typical Scenario A: Register is "Scaled Integer", Northward wants Engineering Value

**Field Semantics**: Temperature register is Int16, value is \(T \times 10\).
**Expectation**: Northward outputs Float64 in ℃, downlink writing also uses ℃.

Configuration Suggestion:

-   wire (`dataType`): `Int16`
-   logical (`transformDataType`): `Float64`
-   `transformScale = 0.1`
-   `transformOffset = 0`
-   `transformNegate = false`
-   `unit = "℃"`
-   `minValue/maxValue`: Configure by "Engineering Value", e.g., `[-40, 125]`

Behavior:

-   Uplink: wire=253 → logical=25.3
-   Downlink: logical=25.3 → wire=253 (Inverse transform + rounding)

### 4.2 Typical Scenario B: Sensor Zero Point Offset

**Field Semantics**: Pressure register returns kPa, but hope northward outputs "Gauge Pressure = Measured - 101.3".

Configuration Suggestion:

-   wire: `Float32` (Or device actual encoding)
-   logical: `Float64`
-   `transformScale = 1.0`
-   `transformOffset = -101.3`

### 4.3 Typical Scenario C: Opposite Direction (Need negate)

For example, some encoders/valve openings have opposite directions:

-   `transformNegate = true`

::: warning
The application order of `transformNegate` is fixed:
Uplink: First scale/offset, then negate; Downlink: First negate, then inverse scale/offset.
:::

---

## 5. Important Limitations and Common Pitfalls

### 5.1 Non-numeric Types (String/Binary/Boolean/Timestamp) are not "Arbitrarily Mappable"

SDK's strategy is "Predictable + No silent corruption":

-   **Downlink (logical→wire)**:
    -   As long as either logical or wire is "Non-numeric type", only **wire==logical and Transform is numeric identity** is allowed.
    -   In other words: **Boolean/String/Binary/Timestamp does not support writing back after Transform type mapping**.
-   **Uplink (wire→logical)**:
    -   For cases where logical is "Numeric type", some "Numeric-like wire encoding" (e.g., String is `"123.4"` or `"0x10"`) will be allowed to be parsed into numbers and then Transformed.
    -   But this is only recommended for compatibility. Production recommends trying to keep wire consistent with protocol real encoding, avoiding reliance on loose parsing fault tolerance.

::: warning Typical Pitfall: Modbus Coil (Boolean wire) wants Northward to write back as Int32
Uplink you can configure logical as numeric (true→1), but **downlink write back will fail**, because Boolean wire does not support logical↔wire Transform mapping.

If write back is needed: Please keep logical=Boolean, and do mapping on northward business side.
:::

### 5.2 Inverse Transform Requirement: `transformScale` cannot be 0

Downlink needs to do \(x=(y-o)/s\), therefore:

-   `transformScale = 0` will cause write back failure

### 5.3 Large Integer Safety: Int64/UInt64 exceeding 2^53 + "Value-changing Transform" will be rejected

-   **identity (Identity Transform)**: Transform **does not change the value itself**. In current implementation equivalent to:
    -   `transformScale` not configured (Or equivalent to 1)
    -   `transformOffset` not configured (Or equivalent to 0)
    -   `transformNegate = false`
    -   (Note: `transformDataType` only affects "External Type/Boxing and Validation", not "Value Transformation" itself)
-   **non-identity (Non-identity Transform)**: As long as you configured any item that changes the value, e.g.:
    -   `transformScale = 0.1`
    -   `transformOffset = -101.3`
    -   `transformNegate = true`

Why is there a 2^53 limit?

When Transform needs to change the value, SDK's uplink/downlink conversion will use `f64` as intermediate calculation type; but `f64` can only "precisely represent" integers up to 2^53 level. When exceeding this range, **invisible rounding may occur**, causing "Calculated value/Written back value" to be silently changed. To satisfy the "Never silent corruption" security policy, SDK will directly reject this situation:

-   `UInt64 > 2^53` or `Int64` absolute value `> 2^53` + **Value-changing Transform** → Conversion Failure

Suggestion:

-   For super large counters (e.g., cumulative pulse/cumulative electricity), try to keep **Identity Transform** (Do not configure scale/offset/negate).
-   If engineering conversion is indeed needed, it is recommended to do controllable integer arithmetic on northward side/business side, or switch to a more suitable value range expression.

### 5.4 rounding behavior: Rounding will occur when writing back integers

When writing back integer types after downlink inverse transform, `round()` will be performed on `f64` before converting to integer.

This means:

-   25.3 via inverse gets 253.0 → OK
-   25.35 via inverse gets 253.5 → Will round (Result depends on IEEE-754 round semantics)

Production Suggestion:

-   If the field requires specific strategies like "Truncate/Floor", current Transform does not provide; please implement explicitly on northward side or driver side, instead of "Guessing rounding".

### 5.5 Value Range of `minValue/maxValue` must align with logical

Core's range validation happens in logical value range, therefore:

-   If you expose engineering value (logical), then `min/max` must also be configured by engineering value
-   Do not write register raw value (wire) range to `min/max`, otherwise "Write is reasonable but rejected by OutOfRange" or vice versa will occur
