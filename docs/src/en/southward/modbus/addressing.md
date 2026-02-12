---
title: 'Modbus Address & Quantity Calculation'
description: 'Modbus address 0/1-based, 40001/30001 logical address conversion, and correct quantity calculation for different DataTypes.'
---

## Address

In NG Gateway Modbus driver, `address` represents **Modbus PDU 0-based Start Address** (0..65535). This is often not the same system as "Logical Address" in many manuals.

### 1) 0-based vs 1-based

If device manual says:
-   "Holding Register 40001 represents the 1st register"

Then in Modbus PDU you usually fill:
-   `address = 0` (Because 40001 is logical mapping, offset is 0)

If manual says:
-   "Register address starts from 0"

Then just fill as per manual.

::: tip Practical Suggestion
Use a "Fixed Value and Verifiable" register to calibrate first (e.g., Serial Number/Model/Firmware Version), confirm address system is correct before batch modeling points.
:::

### 2) 4xxxx / 3xxxx / 1xxxx / 0xxxx Conversion

Many materials use the following "Logical Partitions":

-   **4xxxx**: Holding Registers (0x03) -> `address = Logical Value - 40001`
-   **3xxxx**: Input Registers (0x04) -> `address = Logical Value - 30001`
-   **1xxxx**: Discrete Inputs (0x02) -> `address = Logical Value - 10001`
-   **0xxxx**: Coils (0x01) -> `address = Logical Value - 00001`

> This is just "Human Readable Partition", not protocol layer field. In driver partition is decided by `functionCode`, `address` only fills offset.

## Quantity

`quantity` determines how many basic units of data the driver reads.

### 1) Read Coils/Discrete Inputs (0x01/0x02)

`quantity` unit is **bit (Coil count)**.
-   Single bool: `quantity = 1`

### 2) Read Registers (0x03/0x04)

`quantity` unit is **word (16-bit register count)**.

Recommend calculating by `data_type`, but also supports **Smart Cast** (Read less convert to more or Read more convert to less):

| DataType | Standard quantity (word) | Compatibility Handling |
| :--- | :--- | :--- |
| **Int16 / UInt16** | 1 | - |
| **Int32 / UInt32** | 2 | If quantity=1, auto read 16-bit and promote to 32-bit |
| **Float32** | 2 | If quantity=1, auto read 16-bit integer and convert to float |
| **Float64** | 4 | If quantity=2, auto read 32-bit float and convert to double |
| **Int64 / UInt64** | 4 | If quantity=2, auto read 32-bit integer and promote to 64-bit |
| **Timestamp** | **2 or 4** | **2 words**: Treated as second level (u32 * 1000)<br>**4 words**: Treated as millisecond level (i64) |
| **String / Binary** | N | Must specify length sufficient to cover data |

::: warning
Length of String/Binary is not the general concept of "Character Count". `quantity` of `String/Binary` is essentially "How many registers (words) to read". As for how the string is encoded in this segment of registers (UTF-8/ASCII/UTF-16, whether `\0` terminated, whether 0 padded, byte/word order), it depends on device/host computer convention.

To ensure short strings (e.g., `"a"` / `"shiyue"`) can also be stably read as "clean" values, it is strongly recommended that the device side adopts **Fixed Length Block Full Overwrite + `0x00` Padding**; otherwise it may read intermediate dirty data containing `\0`. See `String` warning in [Modbus](./index.md) document.
:::

### 3) Write Registers/Coils (0x05/0x06/0x0F/0x10)

Action/WritePoint writing also uses `address + quantity`.

**Automatic Inference Mechanism**:
For northward single point write (`write_point`), the driver automatically selects function code based on `quantity`:
-   If definition is `ReadHoldingRegisters` (0x03):
    -   `quantity=1` -> Auto convert to `WriteSingleRegister` (0x06)
    -   `quantity>1` -> Auto convert to `WriteMultipleRegisters` (0x10)

-   If definition is `ReadCoils` (0x01):
    -   `quantity=1` -> Auto convert to `WriteSingleCoil` (0x05)
    -   `quantity>1` -> Auto convert to `WriteMultipleCoils` (0x0F)

This greatly simplifies configuration, usually you only need to configure read attributes, writing will adapt automatically.
