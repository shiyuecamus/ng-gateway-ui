---
title: 'IEC104 TypeID and point modeling'
description: 'Full CA/TypeID/IOA identity, original status and quality, signed values and downlink protocol units.'
---

## 1. Complete point identity

A Channel can carry multiple CAs. Device configuration supplies `ca`; a Point supplies `typeId` and the full 24-bit `ioa` (`0..16777215`). Station address, monitoring TypeID and IOA must all match. Different TypeIDs at one IOA are distinct matching entries, not shortened addresses or interchangeable neighboring types.

They are not necessarily separate physical control objects. Control exclusion follows CA/IOA, so changing a command TypeID cannot bypass an unresolved operation or select the same target twice.

## 2. Model status, value and quality separately

| Type | Meaning to retain | Recommended DataType |
| --- | --- | --- |
| M*SP*\* | Boolean single-point status with independent quality | Boolean |
| M*DP*\* | `0` intermediate, `1` OFF, `2` ON, `3` indeterminate | UInt8 |
| M*ST*\* | Signed `-64..63`; transient is independent | Int16 |
| M*BO*\* | Full unsigned 32-bit pattern | UInt32 |
| Normalized M*ME*\* | Signed raw count divided by `32768` | Float32 / Float64 |
| Scaled M*ME*\* | Signed 16-bit value | Int16 / Float64 |
| Short-float M*ME*\* | IEEE754 short float | Float32 / Float64 |
| M*IT*\* | Signed 32-bit counter; SQ/CY/CA/IV are not value bits | Int32 / Int64 |

Intermediate/indeterminate double-point status is not OFF. Preserve counter sign. Units, scaling and overflow semantics come from the actual device mapping, not an assumed energy unit. Protection EI means invalid elapsed time rather than measurement overflow.

Observe quality details, Test and source-time flags independently of value. Invalid, non-topical, substituted, blocked or overflow facts cannot become normal through conversion. CP24/CP56 source-time facts differ from gateway receive time. Without explicit zone/century information, do not manufacture a complete UTC source timestamp.

## 3. Writes use protocol units

WritePoint maps supported monitoring types to their commands. Action inputs configure command TypeIDs. Each input supplies its own IOA, data type and `controlMode`. See the [command table](./index.md#_4-process-control).

- Single command: Boolean or exact numeric `0/1`.
- Double command: exact `1` OFF or `2` ON; `0/3` are invalid control states.
- Regulating command: exact `1` LOWER or `2` HIGHER, not an absolute position.
- Normalized setpoint: finite `[-1, 32767/32768]`, using Float64 protocol units; `0.5` corresponds to raw count `16384`.
- Scaled setpoint: an exact signed 16-bit integer.
- Short-float setpoint: a number representable as a finite short float.
- Bitstring: an exact unsigned 32-bit integer; UInt32 includes `4294967295`; only `direct` is supported.

Core applies its configured inverse transform once. Do not scale again, reduce states modulo a width, or truncate fractions. Boolean does not replace double/regulating commands; strings and byte blobs do not replace numbers.

## 4. Monitoring facts and operation outcomes

Link ACK is not application confirmation, and positive selection is not execution. Interpret protocol acceptance, completion, unknown outcome and independent monitoring separately. Reuse the original operation for one business intent; reconnection, a matching readback or a new Action does not justify inference or replay.

Device CA metadata accepts `1..65535`; control and GI/CI needing one responder use `1..65534`. GI/CI uses the channel read-interrogation entry rather than a fabricated point write or dummy Action.
