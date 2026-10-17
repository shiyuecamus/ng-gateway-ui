---
title: 'Modbus Address & Quantity Calculation'
description: 'Modbus address 0/1-based, 40001/30001 logical address conversion, and correct quantity calculation for different DataTypes.'
---

## Address

In NG Gateway Modbus driver, `address` represents **Modbus PDU 0-based Start Address** (0..65535). This is often not the same system as "Logical Address" in many manuals.

### 1) 0-based vs 1-based

If device manual says:

- "Holding Register 40001 represents the 1st register"

Then in Modbus PDU you usually fill:

- `address = 0` (Because 40001 is logical mapping, offset is 0)

If manual says:

- "Register address starts from 0"

Then just fill as per manual.

::: tip Practical Suggestion Use a "Fixed Value and Verifiable" register to calibrate first (e.g., Serial Number/Model/Firmware Version), confirm address system is correct before batch modeling points. :::

### 2) 4xxxx / 3xxxx / 1xxxx / 0xxxx Conversion

Many materials use the following "Logical Partitions":

- **4xxxx**: Holding Registers (0x03) -> `address = Logical Value - 40001`
- **3xxxx**: Input Registers (0x04) -> `address = Logical Value - 30001`
- **1xxxx**: Discrete Inputs (0x02) -> `address = Logical Value - 10001`
- **0xxxx**: Coils (0x01) -> `address = Logical Value - 00001`

> This is just "Human Readable Partition", not protocol layer field. In driver partition is decided by `functionCode`, `address` only fills offset.

## Quantity

`address` and `quantity` are required unsigned integers. Quantity zero, missing quantities, fractional numbers and any range with `address + quantity > 65536` are rejected before I/O.

A coil/discrete-input point is one Boolean bit with `quantity=1`. Registers are complete 16-bit words. The wire type determines the exact scalar width:

| Wire `dataType`                   |        Exact register quantity |
| --------------------------------- | -----------------------------: |
| Boolean, Int16, UInt16            |                              1 |
| Int32, UInt32, Float32            |                              2 |
| Int64, UInt64, Float64, Timestamp |                              4 |
| String, Binary                    | Explicit complete field length |

Timestamp is signed 64-bit epoch milliseconds. UInt8/Int8 wire lanes and Int128 wire fields are unqualified. Select an explicit 16/32/64-bit wire type and `transformDataType` for logical conversion. Width mismatch never authorizes prefix truncation or implicit promotion.

String is strict UTF-8 after trailing zero padding is removed. Binary preserves all bytes. Variable fields may span several read PDUs; complete-field word ordering applies only after assembly. A read PDU is at most 125 registers or 2000 bits, while the complete original field can be larger within the address and memory budgets.

## Writes

Writable holding-register points use 06H for one word and 10H for multiple words; writable coil points use 05H. Input registers and discrete inputs are read-only. Actions explicitly select 05H/06H/0FH/10H; single writes require quantity one, multiple coil writes allow at most 1968 bits, and multiple register writes allow at most 123 words. One Boolean action value sets every bit in its declared coil range.

String/Binary writes zero-pad the complete declared field before word reversal and reject overlong values. Each response must echo the exact original address/value/quantity. A confirmed response is service acceptance; it does not prove field execution.
