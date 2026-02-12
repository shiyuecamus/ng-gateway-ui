---
title: 'S7 Address Syntax & Examples'
description: 'Detailed explanation of address expressions supported by NG Gateway S7 driver: DB/I/Q/M/T/C/DI/L/DP areas, type prefixes and bit/byte positioning rules.'
---

## 1. Supported Areas

S7 driver supports the following memory areas. Addresses are case-insensitive.

| Area Code | Name | Description | Address Format Example |
| :--- | :--- | :--- | :--- |
| **DB** | Data Block | Global Data Block | `DB1.W10`, `DB10.INT20` |
| **I** | Input | Digital Input | `I0.0` (Bit), `IB0` (Byte), `IW0` (Word) |
| **Q** | Output | Digital Output | `Q0.0` (Bit), `QB0` (Byte), `QW0` (Word) |
| **M** | Memory | Internal Flag/Intermediate Variable | `M0.0` (Bit), `MB0` (Byte), `MW0` (Word) |
| **V** | V Memory | Mapped to DB1 (Common for S7-200 Smart) | `V0.0` (Bit), `VB0` (Byte), `VW0` (Word) |
| **T** | Timer | Timer Current Value | `T1`, `T10` |
| **C** | Counter | Counter Current Value | `C1`, `C20` |
| **DI** | Instance DB | Instance Data Block | `DI1.W0` |
| **L** | Local | Local Data | `LB0`, `LW0` |
| **DP** | Peripherals | Direct Peripheral Access | `DPB0`, `DPW0` |

::: warning Note
-   **V Area Mapping**: In NG Gateway S7 driver, `V` area is mapped to `DB1` by default. E.g., `VB100` is equivalent to `DB1.B100`.
-   **DB Area Format**: DB address must include block number, format is `DB{BlockNo}.{Type}{Offset}`.
:::

## 2. Data Types and Prefixes (Transport Size)

The driver determines data read length and decoding method via **Type Prefix** in the address. Supports long naming and short naming (e.g., `INT` and `I`).

| Type Name | Long Prefix | Short Prefix | Length (Byte) | Rust Type | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Bit** | `BIT` | `X` | 1/8 | `bool` | Bit access (Must specify `.bit` index; carried as 1 byte on wire) |
| **Byte** | `BYTE` | `B` | 1 | `u8` | Single Byte (Convert on business side if `i8` semantics needed) |
| **Char** | `CHAR` | `C` | 1 | `char` | Single Char (Write/Read as 1 byte code value) |
| **Word** | `WORD` | `W` | 2 | `u16` | Unsigned Word |
| **Int** | `INT` | `I` | 2 | `i16` | Signed Integer |
| **DWord** | `DWORD` | `DW` | 4 | `u32` | Unsigned Double Word |
| **DInt** | `DINT` | `DI` | 4 | `i32` | Signed Double Integer |
| **Real** | `REAL` | `R` | 4 | `f32` | Float |
| **Time** | `TIME` | `T` | 4 | `chrono::Duration` | IEC Time (ms); Note difference from Area `T` (Timer) |
| **Date** | `DATE` | - | 2 | `chrono::NaiveDate` | IEC Date (Driver decodes as date) |
| **TimeOfDay** | - | `TOD` | 4 | `chrono::NaiveTime` | Time of Day (ms), decoded as `NaiveTime` |
| **S5Time** | `S5TIME` | `ST` | 2 | `chrono::Duration` | S5 Format Time, decoded as `Duration` |
| **DateTime** | `DATETIME` | `DT` | 8 | `chrono::NaiveDateTime` | `DATE_AND_TIME` (BCD, 8 bytes) |
| **DateTimeLong**| `DATETIMELONG` | `DTL` | 12 | `chrono::NaiveDateTime` | DTL (12 bytes, S7-1200/1500) |
| **String** | `STRING` | `S` | 256 (envelope) | `String` | `STRING` structure whole read (Latin-1): `[max:u8][len:u8][payload...]` |
| **WString** | `WSTRING` | `WS` | 512 (envelope) | `String` | `WSTRING` structure whole read (UTF-16BE): `[max:u16][len:u16][payload...]` |

::: tip Hint
-   If type prefix is not specified (and no decimal point), default parses as **Byte** (e.g., `M10` equivalent to `MB10`).
-   If there is a decimal point but no type prefix (e.g., `M10.2`), auto parses as **Bit**.
:::

## 3. Address Formats and Examples

The table below shows various common address spellings and their parsing results.

### 3.1 I/Q/M/V Area Examples

I/Q/M/V areas support three types of writing:
1)  **Legacy Address**: Common shorthands in KepServer/Step7 like `ID0/MD200/VD100` (Note: Some are **not directly supported** in NG Gateway and need migration).
2)  **NG Gateway Full Address**: Use long type prefix (e.g., `WORD/REAL/DINT`), best readability.
3)  **NG Gateway Short Address**: Use short type prefix (e.g., `W/R/DI`) or omit type by rule (Recommend explicit type declaration).

| Legacy Address | NG Gateway Full Address | NG Gateway Short Address | S7 Data Type | Rust Type | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **I0.0** | `IBIT0.0` | `IX0.0` | Bit | `bool` | I Area, Byte 0, Bit 0 (Bit access must include `.bit`) |
| **Q1.7** | `QBIT1.7` | `QX1.7` | Bit | `bool` | Q Area, Byte 1, Bit 7 |
| **M10.5** | `MBIT10.5` | `MX10.5` | Bit | `bool` | M Area, Byte 10, Bit 5 |
| **V100.0** | `DB1.BIT100.0` | `VX100.0` | Bit | `bool` | V Area mapped to `DB1.*` in driver (Equivalent to `DB1.X100.0`) |
| **IB0** | `IBYTE0` | `IB0` | Byte | `u8` | I Area, Byte 0 |
| **QB10** | `QBYTE10` | `QB10` | Byte | `u8` | Q Area, Byte 10 |
| **MB20** | `MBYTE20` | `MB20` | Byte | `u8` | M Area, Byte 20 |
| **IW0** | `IWORD0` | `IW0` | Word | `u16` | I Area, Unsigned 16-bit starting at Byte 0 (Big Endian) |
| **QW4** | `QWORD4` | `QW4` | Word | `u16` | Q Area, Unsigned 16-bit starting at Byte 4 (Big Endian) |
| **MW10** | `MWORD10` | `MW10` | Word | `u16` | M Area, Unsigned 16-bit starting at Byte 10 (Big Endian) |
| **ID0** | `IDWORD0` | `IDW0` | DWord | `u32` | I Area, Unsigned 32-bit starting at Byte 0 (Big Endian); Please use `IDW*`/`IDWORD*` for migration |
| **MD200** | `MDINT200` | `MDI200` | DInt | `i32` | M Area, Signed 32-bit starting at Byte 200 (Big Endian); Legacy `MD*` semantics is "4 Bytes", explicitly declare `DI/DINT` in this driver |
| **MD200** | `MREAL200` | `MR200` | Real | `f32` | M Area, IEEE-754 `f32` starting at Byte 200 (Big Endian); If legacy `MD*` represents float, please use `R/REAL` |
| **VD100** | `DB1.DWORD100` | `VDW100` | DWord | `u32` | V Area (DB1) Unsigned 32-bit starting at Byte 100 (Big Endian); Legacy `VD*` please change to `VDW*` or directly use `DB1.DW*` |

### 3.2 DB Area Examples

DB Area address must start with `DB`, followed by block number. Format: `DB{BlockNo}.{Type}{Offset}`.

:::: warning Migration Reminder
NG Gateway current address parser (See `ng-gateway-southward/s7/src/protocol/frame/addr.rs`) **does not support** Siemens legacy "Combined Prefix" like `DBX/DBB/DBW/DBD` (e.g., `DB1.DBD100`). Please use **NG Gateway Full/Short Address** in the table below.
::::

| Legacy Address | NG Gateway Full Address | NG Gateway Short Address | S7 Data Type | Rust Type | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DB1.DBX0.0** | `DB1.BIT0.0` | `DB1.X0.0` | Bit | `bool` | DB1, Byte 0 Bit 0 (Bit must be written as `*.Xbyte.bit` or `*.BITbyte.bit`) |
| **DB10.DBB0** | `DB10.BYTE0` | `DB10.B0` | Byte | `u8` | DB10, Byte 0 |
| **DB10.DBW2** | `DB10.WORD2` | `DB10.W2` | Word | `u16` | DB10, Unsigned 16-bit starting at Byte 2 (Big Endian) |
| **DB10.DBW4** | `DB10.INT4` | `DB10.I4` | Int | `i16` | DB10, Signed 16-bit starting at Byte 4 (Big Endian) |
| **DB1.DBD0** | `DB1.DWORD0` | `DB1.DW0` | DWord | `u32` | DB1, Unsigned 32-bit starting at Byte 0 (Big Endian) |
| **DB1.DBD4** | `DB1.DINT4` | `DB1.DI4` | DInt | `i32` | DB1, Signed 32-bit starting at Byte 4 (Big Endian) |
| **DB1.DBD8** | `DB1.REAL8` | `DB1.R8` | Real | `f32` | DB1, IEEE-754 `f32` starting at Byte 8 (Big Endian); Legacy `DBD*` only means "4 Bytes", must explicitly declare `DW/DI/R` in this driver |
| **DB2.STRING0** | `DB2.STRING0` | `DB2.S0` | String | `String` | S7 `STRING` Structure (`[max:u8][len:u8][payload...]`, Latin-1), address should point to structure start offset |
| **DB2.WSTRING100** | `DB2.WSTRING100` | `DB2.WS100` | WString | `String` | S7 `WSTRING` Structure (`[max:u16][len:u16][payload...]`, UTF-16BE), address should point to structure start offset |
| - | `DB5.DATETIME0` | `DB5.DT0` | DateTime | `chrono::NaiveDateTime` | 8 Bytes `DATE_AND_TIME` (BCD) |
| - | `DB5.DATETIMELONG0` | `DB5.DTL0` | DateTimeLong | `chrono::NaiveDateTime` | 12 Bytes DTL (S7-1200/1500); Different from `DT`, nanosecond field is 24-bit BE |

#### Best Practices and Common Pitfalls

-   **Explicitly Declare Type**: For production environment, recommend using short and explicit type prefixes (e.g., `DB1.R8`, `MDI200`), avoiding ambiguity from implicit Byte (e.g., `M10`).
-   **Bit Address must include `.bit`**: E.g., `QX1` will be judged illegal in driver, must be written as `QX1.0` (See parser test cases).
-   **Legacy `DBD/MD/VD` only represents "4 Bytes"**: In NG Gateway syntax, must specify which of `DW` (u32) / `DI` (i32) / `R` (f32) it is.
-   **`V` Area is Syntactic Sugar for `DB1`**: `VB100` is equivalent to `DB1.B100`. When collaborating across teams/troubleshooting, writing `DB1.*` directly is usually more intuitive.
-   **`STRING/WSTRING` offset points to structure start**: `STRING`/`WSTRING` variables in PLC contain length header (2/4 bytes). Driver reads and decodes the whole structure, offset should not point to the first character.
-   **Endianness and Alignment**: Numeric types use Big Endian encoding per S7 convention. Recommend natural alignment by type (Word starts at even, DWord/Real starts at multiple of 4) to improve readability and reduce potential overhead on PLC side.

### 3.3 Timer / Counter Examples

| Address | Type | Description |
| :--- | :--- | :--- |
| **T1** | Timer | Timer T1 |
| **C10** | Counter | Counter C10 |
