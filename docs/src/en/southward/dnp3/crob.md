---
title: 'DNP3 CROB: ControlCode(u8) Value Table'
description: 'Bitfield semantics of value=u8 when issuing CROB(Control Relay Output Block) in NG Gateway DNP3 driver, gateway allowed value range (48 items), and how to choose for WritePoint/Action.'
---

When you issue CROB command via **WritePoint** or **Action**, the driver requires:

-   `data_type=UInt8`
-   `value` is a **u8 Control Code** (DNP3 Group12Var1 ControlCode)

However, **not all u8 from 0..=255 are accepted by the gateway**: To avoid ambiguity/malfunction, the gateway only supports a clear safe subset (See full table below).

## 1. Bitfield Definition

Driver encoding/decoding of CROB `ControlCode` follows this bitfield:

-   **bits 7..6**: Trip/Close Code (TCC)
    -   0b00 → `Nul`
    -   0b01 → `Close`
    -   0b10 → `Trip`
    -   0b11 → `Reserved` (**Gateway Rejects**)
-   **bit 5**: `clear`
-   **bit 4**: `queue` (Obsolete in standard, but still representable; device support depends on Outstation)
-   **bits 3..0**: OpType
    -   1 → `PulseOn`
    -   2 → `PulseOff`
    -   3 → `LatchOn`
    -   4 → `LatchOff`
    -   0/5..15 (**Gateway Rejects**)

## 2. Most Common 4 Values

If you don't need `Trip/Close`, nor `queue/clear` (Most common in field), then:

-   `PulseOn` → **1 (0x01)**
-   `PulseOff` → **2 (0x02)**
-   `LatchOn` → **3 (0x03)**
-   `LatchOff` → **4 (0x04)**

## 3. Gateway Allowed Full ControlCode(u8) List

| u8(dec) | u8(hex) | OpType | TCC | queue | clear |
| ---: | ---: | --- | --- | --- | --- |
| 1 | 0x01 | PulseOn | Nul | false | false |
| 2 | 0x02 | PulseOff | Nul | false | false |
| 3 | 0x03 | LatchOn | Nul | false | false |
| 4 | 0x04 | LatchOff | Nul | false | false |
| 17 | 0x11 | PulseOn | Nul | true | false |
| 18 | 0x12 | PulseOff | Nul | true | false |
| 19 | 0x13 | LatchOn | Nul | true | false |
| 20 | 0x14 | LatchOff | Nul | true | false |
| 33 | 0x21 | PulseOn | Nul | false | true |
| 34 | 0x22 | PulseOff | Nul | false | true |
| 35 | 0x23 | LatchOn | Nul | false | true |
| 36 | 0x24 | LatchOff | Nul | false | true |
| 49 | 0x31 | PulseOn | Nul | true | true |
| 50 | 0x32 | PulseOff | Nul | true | true |
| 51 | 0x33 | LatchOn | Nul | true | true |
| 52 | 0x34 | LatchOff | Nul | true | true |
| 65 | 0x41 | PulseOn | Close | false | false |
| 66 | 0x42 | PulseOff | Close | false | false |
| 67 | 0x43 | LatchOn | Close | false | false |
| 68 | 0x44 | LatchOff | Close | false | false |
| 81 | 0x51 | PulseOn | Close | true | false |
| 82 | 0x52 | PulseOff | Close | true | false |
| 83 | 0x53 | LatchOn | Close | true | false |
| 84 | 0x54 | LatchOff | Close | true | false |
| 97 | 0x61 | PulseOn | Close | false | true |
| 98 | 0x62 | PulseOff | Close | false | true |
| 99 | 0x63 | LatchOn | Close | false | true |
| 100 | 0x64 | LatchOff | Close | false | true |
| 113 | 0x71 | PulseOn | Close | true | true |
| 114 | 0x72 | PulseOff | Close | true | true |
| 115 | 0x73 | LatchOn | Close | true | true |
| 116 | 0x74 | LatchOff | Close | true | true |
| 129 | 0x81 | PulseOn | Trip | false | false |
| 130 | 0x82 | PulseOff | Trip | false | false |
| 131 | 0x83 | LatchOn | Trip | false | false |
| 132 | 0x84 | LatchOff | Trip | false | false |
| 145 | 0x91 | PulseOn | Trip | true | false |
| 146 | 0x92 | PulseOff | Trip | true | false |
| 147 | 0x93 | LatchOn | Trip | true | false |
| 148 | 0x94 | LatchOff | Trip | true | false |
| 161 | 0xA1 | PulseOn | Trip | false | true |
| 162 | 0xA2 | PulseOff | Trip | false | true |
| 163 | 0xA3 | LatchOn | Trip | false | true |
| 164 | 0xA4 | LatchOff | Trip | false | true |
| 177 | 0xB1 | PulseOn | Trip | true | true |
| 178 | 0xB2 | PulseOff | Trip | true | true |
| 179 | 0xB3 | LatchOn | Trip | true | true |
| 180 | 0xB4 | LatchOff | Trip | true | true |

## 4. How to use WritePoint / Action?

### 4.1 WritePoint (BinaryOutput Write Point)

-   `point.group=BinaryOutput`
-   `point.data_type=UInt8`
-   `value`: Fill in `u8(dec)` from the table on this page

:::: warning Note
WritePoint path **CANNOT** control `crobCount/crobOnTimeMs/crobOffTimeMs` (Driver intentionally does not expose these protocol level fields). If you need to configure counts/pulse timing, please use **Action** path.
::::

### 4.2 Action (CROB Batch Control)

-   `Action.inputs[].driver_config.group=CROB`
-   `Action.inputs[].driver_config.index=<Target Index>`
-   `Action.inputs[].data_type=UInt8`
-   `Action.inputs[].value`: Fill in `u8(dec)` from the table on this page
-   `crobCount/crobOnTimeMs/crobOffTimeMs`: Configured via **Parameter Level Modeling Fields**

:::: warning Note
If the `value` you pass is not in the 48 values in the table above (e.g., op_type=0 or tcc=Reserved), the driver will directly reject and return an error.
::::
