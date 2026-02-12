---
title: 'CJT188 Address / Type / DI / field_key'
description: 'CJ/T 188 device address 14-digit hex structure, meter type and meter family, and filling and decoding semantics of DI / field_key/scale (Aligned with current implementation).'
---

## 1) Device Address

The driver splits "Meter Type (T)" and "Address Field (A0..A6)" into two fields (Consistent with CJ/T 188-2018 frame structure):

-   **`meterType`**: Meter Type (T, 1 byte, 0..=255)
-   **`address`**: Address Field (A0..A6, 7 bytes)

### `meterType` (T)

Type code used to distinguish Water/Heat/Gas/Custom etc.

**2018 Meter Type and Code (CJ/T 188-2018):**

| Meter Type Range | Code (T) | Meter Description |
|------------------|----------|-------------------|
| 10H ~ 19H | 10H | Cold Water Meter |
| | 11H | Domestic Hot Water Meter |
| | 12H | Direct Drinking Water Meter |
| | 13H | Reclaimed Water Meter |
| 20H ~ 29H | 20H | Heat Meter (Heat) |
| | 21H | Heat Meter (Cooling) |
| | 22H | Heat Meter (Heat & Cooling) |
| 30H ~ 39H | 30H | Gas Meter |
| 40H ~ 49H | — | Custom Meter |

**2004 Meter Type and Code (CJ/T 188-2004):**

| Meter Type Range | Code (T) | Meter Description |
|------------------|----------|-------------------|
| 10H ~ 19H | 10H | Cold Water Meter |
| | 11H | Domestic Hot Water Meter |
| | 12H | Direct Drinking Water Meter |
| | 13H | Reclaimed Water Meter |
| 20H ~ 29H | 20H | Heat Meter (Heat) |
| | 21H | Heat Meter (Cooling) |
| 30H ~ 39H | 30H | Gas Meter |
| 40H ~ 49H | 40H | Custom Meter |

### `address`

Address field consists of **7 bytes** (A0..A6), each byte is usually **2-digit BCD**.

-   **Driver Configuration Format**: `address` uses **14-digit hex string**, representing **A6..A0 Bytes** (High byte first), e.g., `00000000EE0001`

::: tip Remark
Protocol definition "Low address first, High address last" refers to **A0..A6 byte order on wire**; Driver automatically completes conversion of **A6..A0 (Config) ↔ A0..A6 (Wire Order)** during protocol encoding/decoding.
:::

## 2) DI

Driver UI expresses DI in 4-digit hex (2 bytes) (e.g., `901F`).

**DI Byte Order Difference**:
-   **2018 Version**: Little-Endian. `901F` sent as `1F 90`.
-   **2004 Version**: Big-Endian. `901F` sent as `90 1F`.

Driver automatically handles byte order based on Protocol Version in channel configuration.

Practical Suggestion:

-   Base on manufacturer manual/master station tool
-   If reading fails, prioritize confirming:
    -   Whether DI is valid under 2004/2018 version
    -   Whether device needs SER/SEQ (2018) and link layer parameters consistency

## 3) field_key and Schema Driven Parsing

### 3.1 One DI ≠ One Point

**One DI (Data Identifier) in CJ/T 188 usually represents a group of fields** (e.g., `901F` contains "Cumulative/Time/Status" etc.). This driver adopts **DI Schema Driven Parsing**:

-   Driver classifies `Device.meterType` into **Water/Heat/Gas/Custom** (Meter Family)
-   Selects built-in schema by `(DI, Meter Family)`
-   Parses response of that DI into a set of `field_key -> NGValue`
-   Each Point "picks" one field to report from DI data group via `field_key`

Therefore:

-   **Same DI Multi-field Collection**: Create multiple Points, same `di`, different `field_key`
-   **Performance**: Driver reads grouped by DI; only initiates one request for same device same DI, then distributes to multiple Points

### 3.2 field_key must come from built-in schema

`field_key` is not an arbitrary string, it must match field keys in driver built-in schema:

-   If `field_key` does not exist or does not belong to that DI/Meter Family: That point will be skipped, and log prompts point value not produced (You need to correct according to DI/field_key list in this article)
-   If schema not found for `(DI, meterType family)`: That DI parsing fails, log prompts (You need to change DI or confirm `meterType`)

## 4) DI / field_key

### 4.1 Water / Gas

| DI (hex) | Meaning (Schema Semantics) | Available field_key (All) |
| :--- | :--- | :--- |
| `901F` | Water/Gas: Comprehensive Reading (Current Cumulative, Settlement Day, Time, Status) | `current_flow`, `settlement_flow`, `datetime`, `status` |
| `D120..D12B` | Last 1..12 Months: Settlement Day Cumulative Flow | `settlement_flow` |
| `D200..D2FF` | Last 1..256 Months: Settlement Day Cumulative Flow | `settlement_flow` |
| `D300..D3FF` | Last 1..256 Times: Timed Freeze Data | `freeze_datetime`, `cumulative_flow`, `flow_rate`, `temperature`, `pressure` |
| `D400..D4FF` | Last 1..256 Times: Instant Freeze Data | `freeze_datetime`, `cumulative_flow`, `flow_rate`, `temperature`, `pressure` |

#### Field Explanation (Water/Gas)

| field_key | Meaning | Recommended DataType | Remark |
| :--- | :--- | :--- | :--- |
| `current_flow` | Current Cumulative Flow | `Float64` | `BCDWithUnit(4 + unit)`, unit code not reported; Suggest Point.unit write `m³` |
| `settlement_flow` | Settlement Day/Historical Settlement Day Cumulative Flow | `Float64` | `BCDWithUnit(4 + unit)` |
| `datetime` | Real-time Time | `Timestamp` | Unix epoch ms (UTC) |
| `status` | Status Bit | `UInt16` | Actual semantics `u16` Little Endian; Parse bitwise (See below) |
| `freeze_datetime` | Freeze Time (Last N Times) | `Timestamp` | 7-byte DateTime → epoch ms (UTC) |
| `cumulative_flow` | Freeze Time Cumulative Flow | `Float64` | |
| `flow_rate` | Freeze Time Instantaneous Flow | `Float64` | `BCDWithUnit(4 + unit)`, schema built-in decimals=4 |
| `temperature` | Temperature | `Float64` | `BCD(decimals=2)` |
| `pressure` | Pressure | `Float64` | `BCD(decimals=2)` |

### 4.2 Heat

| DI (hex) | Meaning (Schema Semantics) | Available field_key (All) |
| :--- | :--- | :--- |
| `901F` | Heat Meter: Comprehensive Reading (Heat/Power/Flow/Temp/Hours/Time/Status) | `settlement_heat`, `current_heat`, `heat_power`, `flow_rate`, `cumulative_flow`, `supply_temp`, `return_temp`, `working_hours`, `datetime`, `status` |
| `911F` | Heat+Cool: Comprehensive Reading (With Cooling, Supply/Return Pressure) | `settlement_heat`, `settlement_cooling`, `current_heat`, `current_cooling`, `heat_power`, `flow_rate`, `cumulative_flow`, `supply_temp`, `return_temp`, `supply_pressure`, `return_pressure`, `working_hours`, `datetime`, `status` |
| `D120..D12B` | Last 1..12 Months: Settlement Day Heat | `settlement_heat` |
| `D200..D2FF` | Last 1..256 Months: Settlement Day Heat/Cool/Flow | `settlement_heat`, `settlement_cooling`, `settlement_flow` |

#### Field Explanation (Heat)

| field_key | Meaning | Recommended DataType | Remark |
| :--- | :--- | :--- | :--- |
| `settlement_heat` | Settlement Day Heat / Historical Settlement Day Heat | `Float64` | `BCDWithUnit` |
| `current_heat` | Current Heat | `Float64` | `BCDWithUnit` |
| `settlement_cooling` | Settlement Day Cooling (Only `911F`/`D200..D2FF`) | `Float64` | `BCDWithUnit` |
| `current_cooling` | Current Cooling (Only `911F`) | `Float64` | `BCDWithUnit` |
| `heat_power` | Heat Power | `Float64` | `BCDWithUnit(3 + unit)` |
| `flow_rate` | Instantaneous Flow | `Float64` | `BCDWithUnit(3 + unit)` (schema built-in decimals=3/4) |
| `cumulative_flow` | Cumulative Flow | `Float64` | `BCDWithUnit` |
| `supply_temp` | Supply Temperature | `Float64` | `BCD(decimals=2)` |
| `return_temp` | Return Temperature | `Float64` | `BCD(decimals=2)` |
| `supply_pressure` | Supply Pressure (Only `911F`) | `Float64` | `BCD(decimals=2)` |
| `return_pressure` | Return Pressure (Only `911F`) | `Float64` | `BCD(decimals=2)` |
| `working_hours` | Cumulative Working Hours | `Int64` | `BCDInteger` |
| `datetime` | Real-time Time | `Timestamp` | Unix epoch ms (UTC) |
| `status` | Status Bit | `UInt16` | `u16` Little Endian |
| `settlement_flow` | Historical Settlement Day Cumulative Flow (Only `D200..D2FF`) | `Float64` | `BCDWithUnit` |

### 4.3 Common (Universal for all meter families)

| DI (hex) | Meaning (Schema Semantics) | Available field_key (All) |
| :--- | :--- | :--- |
| `907F` | Real-time Time | `datetime` |
| `8102` | Price Table (3 Tiers) | `price_1`, `volume_1`, `price_2`, `volume_2`, `price_3` |
| `8103` | Settlement Day (day) | `settlement_day` |
| `8104` | Reading Day (day) | `reading_day` |
| `8105` | Purchase Amount (With Status) | `purchase_seq`, `this_purchase`, `total_purchase`, `remaining`, `status` |

## 5) Status Bit (status) Field

`status` field after schema parsing is semantically **`u16` Little Endian Bitmap**. Recommend Point config as `data_type=UInt16`, easy for downstream bitwise parsing. Basic bit definition see driver code comments:

-   **D0**: Valve Switch (0=Open, 1=Closed)
-   **D1**: Valve Status (0=Normal, 1=Abnormal)
-   **D2**: Battery Voltage (0=Normal, 1=Undervoltage)
-   **D3..D15**: Manufacturer Defined

Recommended Practice:

-   Model `status` as a Point (`field_key=status`)
-   Parse bitwise in Northward or Rule Engine (Or remap to multiple boolean attributes)
