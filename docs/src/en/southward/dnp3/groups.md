---
title: 'DNP3 Object Group/Index & Command Type'
description: 'How to choose Point object group and index, semantics of Integrity/Event Scan, and input value requirements for commands like CROB/Analog Output.'
---

## 1) Point: Object Group (group) and Index

DNP3 data points usually consist of several key points:

-   Object Group
-   Variation
-   Index

NG Gateway current version simplifies to:

-   **group**: Object Group (Enum)
-   **index**: Index

Common group meanings:

-   BinaryInput: Digital Input
-   DoubleBitBinaryInput: Double Bit Digital Input
-   BinaryOutput: Digital Output Status
-   Counter: Counter
-   FrozenCounter: Frozen Counter
-   AnalogInput: Analog Input
-   AnalogOutput: Analog Output Status
-   OctetString: Octet String

**Modeling Suggestion**:

-   `BinaryInput` / `DoubleBitBinaryInput`: Recommend `data_type=Boolean` or `UInt8` (Per field semantics)
-   `AnalogInput`: Recommend `Float32/Float64` (Configure `scale` if necessary)
-   `Counter` / `FrozenCounter`: Recommend `UInt32/UInt64`
-   `OctetString`: Recommend `String` or `Binary`

## 2) DataType and DNP3 Variation Mapping Relationship

### 2.1 Design Philosophy

In DNP3 protocol, each Object Group has multiple Variations, for example:

| Group | Variation | Meaning |
|-------|-----------|---------|
| 30 | 1 | 32-bit Analog Input With Flag |
| 30 | 2 | 16-bit Analog Input With Flag |
| 30 | 3 | 32-bit Analog Input Without Flag |
| 30 | 5 | Single-precision (Float32) With Flag |
| 30 | 6 | Double-precision (Float64) With Flag |

NG Gateway adopts **Simplified Modeling** strategy:

-   **Read Direction**: Use Class Data request, let Outstation decide which Variation to return
-   **Write Direction**: Implicitly select corresponding Variation via `DataType` field

Advantages of this design:
1.  **Best Compatibility**: Different Outstations may support different Variations
2.  **User Friendly**: No need to deeply understand DNP3 protocol details
3.  **Compliant with IEEE 1815 Standard**: Class Data is the recommended data request method

### 2.2 Variation Handling on Read

When NG Gateway executes Integrity Scan or Event Scan:

```
Master (NG Gateway)                    Outstation
        |                                   |
        |--- READ Class 0/1/2/3 ----------->|
        |    (Group60Var1~4)                |
        |                                   |
        |<-- Response with actual data -----|
        |    (Group30Var1 or Var5 etc.)     |
```

-   Driver underlying library (dnp3-rs) will **unify convert** responses of different Variations to standard Rust types
-   For example: `Group30Var1`, `Group30Var5`, `Group30Var6` are all converted to `AnalogInput { value: f64, flags: Flags, time: Option<Time> }`
-   Your configured `DataType` is used for **Final Value Conversion** (e.g., `f64` → `Int32` truncation)

::: tip Important
In uplink path, your `DataType` configuration does not affect request, only affects type conversion of the final value.
:::

### 2.3 Variation Selection on Write

When writing commands (WritePoint / Action), `DataType` **directly determines** which DNP3 Variation to use:

#### Analog Output Command (AnalogOutputCommand - Group 41)

| DataType | DNP3 Variation | Description |
|----------|----------------|-------------|
| `Int16` / `UInt16` | Group41Var2 | 16-bit Analog Output |
| `Int32` / `UInt32` | Group41Var1 | 32-bit Analog Output |
| `Float32` | Group41Var3 | Single-precision Float |
| `Float64` | Group41Var4 | Double-precision Float |

#### CROB Command (Control Relay Output Block - Group 12)

CROB always uses `Group12Var1`:

| DataType | Value Parsing | Description |
|----------|-------------|-------------|
| `UInt8` (Recommended) | value=u8 (Control Code) | Product-level unified semantics: Downlink value only accepts numeric control code; but gateway only allows explicit safe subset (See [`crob.md`](./crob.md)) |

### 2.3.1 CROB Control Code Bitfield Semantics

In NG Gateway current implementation, CROB `ControlCode` is an **8-bit bitfield**, composed of:

-   **bits 7..6**: Trip/Close Code (TCC)
    -   0b00 → `Nul`
    -   0b01 → `Close`
    -   0b10 → `Trip`
    -   0b11 → `Reserved` (**Gateway Rejects**)
-   **bit 5**: `clear`
-   **bit 4**: `queue` (Obsolete in standard, but still representable; support depends on Outstation)
-   **bits 3..0**: OpType (Operation Type)
    -   1 → `PulseOn`
    -   2 → `PulseOff`
    -   3 → `LatchOn`
    -   4 → `LatchOff`
    -   0/5..15 (**Gateway Rejects**)

#### Common Control Code Examples

::: warning Note
Table below assumes `tcc=Nul`, `clear=false`, `queue=false`, so control code is op (low 4 bits). Note gateway **Disallows op=0(Nul)**.

If you need Trip/Close or queue/clear, please refer to gateway allowed values, full value table see [`crob.md`](./crob.md).
:::

| Semantics | op_type | control_code (Dec) | control_code (Hex) |
| :--- | :--- | ---:| ---:|
| PulseOn | PulseOn | 1 | 0x01 |
| PulseOff | PulseOff | 2 | 0x02 |
| LatchOn | LatchOn | 3 | 0x03 |
| LatchOff | LatchOff | 4 | 0x04 |

### 2.4 Full Variation Reference Table

Below are main Variations of DNP3 object groups and their usage (For reference):

#### Binary Input (Group 1/2)

| Group | Var | Type | Description |
|-------|-----|------|-------------|
| 1 | 1 | Static | Packed Format (No flags) |
| 1 | 2 | Static | With Flags |
| 2 | 1 | Event | Without Time |
| 2 | 2 | Event | With Absolute Time |
| 2 | 3 | Event | With Relative Time |

#### Analog Input (Group 30/32)

| Group | Var | Type | Description |
|-------|-----|------|-------------|
| 30 | 1 | Static | 32-bit With Flag |
| 30 | 2 | Static | 16-bit With Flag |
| 30 | 3 | Static | 32-bit Without Flag |
| 30 | 5 | Static | Single-precision (f32) With Flag |
| 30 | 6 | Static | Double-precision (f64) With Flag |
| 32 | 1 | Event | 32-bit Without Time |
| 32 | 3 | Event | 32-bit With Time |
| 32 | 5 | Event | Single-precision Without Time |
| 32 | 7 | Event | Single-precision With Time |

#### Counter (Group 20/21/22)

| Group | Var | Type | Description |
|-------|-----|------|-------------|
| 20 | 1 | Static | 32-bit With Flag |
| 20 | 2 | Static | 16-bit With Flag |
| 20 | 5 | Static | 32-bit Without Flag |
| 21 | 1 | Frozen | 32-bit With Flag |
| 21 | 5 | Frozen | 32-bit With Flag and Time |
| 22 | 1 | Event | 32-bit With Flag |
| 22 | 5 | Event | 32-bit With Flag and Time |

#### Analog Output (Group 40/41/42)

| Group | Var | Type | Description |
|-------|-----|------|-------------|
| 40 | 1 | Status | 32-bit With Flag |
| 40 | 2 | Status | 16-bit With Flag |
| 40 | 3 | Status | Single-precision With Flag |
| 41 | 1 | Command | 32-bit ← **DataType=Int32** |
| 41 | 2 | Command | 16-bit ← **DataType=Int16** |
| 41 | 3 | Command | Single-precision ← **DataType=Float32** |
| 41 | 4 | Command | Double-precision ← **DataType=Float64** |
| 42 | 7 | Event | Single-precision With Time |

## 3) Scan Semantics: Integrity vs Event

Driver will periodically execute:

-   Integrity Scan: Acquire "Full Snapshot" (Class 0/1/2/3)
-   Event Scan: Acquire "Event Changes" (Class 1/2/3)

The difference depends on Outstation configuration and whether data points support event reporting.
