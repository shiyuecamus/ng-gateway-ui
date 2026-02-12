---
title: 'IEC104 TypeID & Point Modeling Best Practices'
description: 'How to choose Point typeId/IOA, how to handle Single Point/Double Point/Telemetry/Integrated Totals, and value type requirements for Write Commands (C_*).'
---

## 1) How Driver Maps Uplink ASDU to Point

NG Gateway IEC104 driver internally uses `(typeId, ioa)` as key to match points:

-   `typeId`: ASDU TypeID in point configuration (u8)
-   `ioa`: Information Object Address in point configuration

Therefore:

-   **Same IOA under different TypeID are different points**
-   If you configure Point TypeID wrong, even if IOA is correct, data will not be matched

## 2) How to Choose DataType for Common Uplink Types (M_*)

### Single Point (M_SP_*)

Semantics: Switch/Status (1 bit)
Recommendation:

-   `DataType = Boolean`

### Double Point (M_DP_*)

Semantics: Double point status, usually value 0..3 (e.g., Intermediate/On/Off/Indeterminate, specific to protocol)
Recommendation:

-   `DataType = UInt8` (Preserve raw semantics)
-   Or map 0..3 to business enum in edge computing layer (More readable)

### 32bit Bit String (M_BO_*)

Semantics: 32-bit bit string (e.g., Fault Word, Alarm Word)
Recommendation:

-   `DataType = UInt32`

### Telemetry (M_ME_*)

IEC104 Telemetry has multiple expressions:

-   Normalized (M_ME_NA/ND)
-   Scaled (M_ME_NB)
-   Short Float (M_ME_NC)

Recommendation:

-   Prioritize consistency with field RTU/Master Station agreement
-   For "Engineering Value" telemetry, recommend `Float32/Float64`, combined with `scale` for unit conversion

### Integrated Totals (M_IT_*)

Semantics: Energy/Cumulative Count
Recommendation:

-   `DataType = Int64` or `UInt64`

## 3) Value Type Requirements for Write Command Types (C_*)

When writing (WritePoint / Action Parameter), the driver will force convert input value to target type according to Command TypeID:

-   C_SC_*: bool
-   C_DC_*: u8
-   C_RC_*: u8
-   C_SE_* (NA/NB): i16
-   C_SE_* (NC): f32
-   C_BO_*: i32

::: tip Best Practice
Point/Parameter `data_type` should be consistent with command semantics, so core type validation and driver conversion will be more predictable.
:::

## 4) How to Model CA (Common Address)

CA is modeled as Device configuration:

-   **One CA One Device** is the most common practice
-   When multiple CAs exist on the same TCP link, create multiple Devices sharing one Channel
