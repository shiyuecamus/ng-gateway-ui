---
title: 'Modbus'
description: 'NG Gateway Modbus Southward Driver Usage & Configuration: TCP/RTU, Point Modeling, Byte/Word Order, Explicit Transform, Batch Read/Write, and Best Practices.'
---

## 1. Protocol Introduction

Modbus is a classic industrial field communication protocol, with common forms including **Modbus TCP** (Ethernet) and **Modbus RTU** (Serial/RS-485). It uses "Register/Coil" as core abstractions:

- **Coils**: bit (Usually Read/Write)
- **Discrete Inputs**: bit (Usually Read-Only)
- **Holding Registers**: 16-bit register (Usually Read/Write)
- **Input Registers**: 16-bit register (Usually Read-Only)

The driver delegates native ADU/CRC/TID handling to `tokio-modbus`. Pure original range planning and complete-field register layout remain local modules; SDK conversion and actual transport ownership stay in the adapter.

## 2. Configuration Model

### 2.1 Channel Configuration

Channel is the boundary of "Connection and Session": **The same TCP connection or the same RS-485 serial line** should be modeled as a Channel.

#### 2.1.1 `connection.kind` (Connection Type)

- **tcp**: Modbus TCP
- **rtu**: Modbus RTU (Serial)

#### 2.1.2 TCP Parameters (When `connection.kind = tcp`)

- **`connection.host`**: Remote host (IPv4 or hostname, excluding schema/port)
- **`connection.port`**: Port, default `502`

::: tip Suggestion

- Field devices mostly have fixed IPs, it is recommended to fill in IP directly; avoid extra uncertainty introduced by DNS resolution. :::

#### 2.1.3 RTU Parameters (When `connection.kind = rtu`)

- **`connection.port`**: Serial port path
  - Linux Example: `/dev/ttyUSB0`
  - Windows Example: `COM3`
- **`connection.baudRate`**: Baud rate (Default 9600)
- **`connection.dataBits`**: Data bits (8 required)
- **`connection.stopBits`**: One with parity, two without parity
- **`connection.parity`**: None/Odd/Even; UI defaults to Even. Standard RTU characters are8E1,8O1 or8N2

#### 2.1.4 `byteOrder` / `wordOrder`

Modbus register is a 16-bit word; when point data type is 32/64-bit, it spans multiple registers. Different devices have differences in "Byte/Word Order" implementation:

- **`byteOrder`**: Order of two bytes inside a register (BigEndian/LittleEndian)
- **`wordOrder`**: Order of words when multiple registers are used (BigEndian/LittleEndian)

::: tip **Typical Combinations**:

- Common PLC: `byteOrder=BigEndian`, `wordOrder=BigEndian`
- Some devices (Especially legacy devices) use "Word Swap" for 32-bit/64-bit: `wordOrder=LittleEndian`

Suggest confirming in host computer/manufacturer manual; if the read float value is "obviously absurd", prioritize checking byte/word order. :::

#### 2.1.5 Actual owner and pending work

A channel owns one native TCP connection or RTU bus. `maxPendingOperations` defaults to32 and bounds active plus waiting work; `maxPendingBytes` defaults to33554432 and reserves native plan/value bytes before queue admission. Original deadlines and cancellation also apply during waits. `tcpPoolSize` and `maxTimeouts` are rejected retired fields; an active incomplete transaction retires its context immediately.

#### 2.1.6 Batch Read Planning Parameters

| Field | Scope | Default | Description |
| :-- | :-- | :-- | :-- |
| `maxBatchRegisters` | 0x03/0x04 (Register Read) | 120 | Max span (number of words) for a single read request. Strictly within1..125 |
| `maxGapRegisters` | 0x03/0x04 (Register Read) | 8 | Max "Gap" (word address difference) allowed when merging adjacent points |
| `maxBatchBits` | 0x01/0x02 (Bit Read) | 2000 | Max span (number of bits) for a single read request. **Protocol hard limit <=2000** |
| `maxGapBits` | 0x01/0x02 (Bit Read) | 500 | Max "Gap" (bit address difference) allowed when merging adjacent points |

::: warning `maxBatch*` represents "Total quantity of a range read" (span), not "Number of points". :::

### 2.2 Device Configuration

Device represents a Slave.

- **`slaveId`**: Unit ID (TCP1..255; RTU1..247; broadcast is not admitted)

#### 2.2.1 Group collection

Modbus driver enables **group collection** in Polling collection path, grouping key is `slaveId`:

- **Same `slaveId`**: Collector will merge multiple business Devices into one `collect_data(items)` call, driver will merge points and execute batch read (read request count closer to theoretical minimum), then split into respective `NorthwardData` outputs by business `device_id`.
- **Different `slaveId`**: Will be split into different groups for separate collection.

### 2.3 Point Configuration

- **`functionCode`**:
  - `ReadCoils(0x01)` / `ReadDiscreteInputs(0x02)`
  - `ReadHoldingRegisters(0x03)` / `ReadInputRegisters(0x04)`
- **`address`**: Start address (0..65535, **0-based**)
- **`quantity`**: Read quantity (Coil bit count or Register word count)

#### 2.3.1 wire/logical data type & Transform (Must Read)

Modbus `dataType` is **wire data type (Protocol/Memory layout semantics)**: It determines how the driver decodes from register/coil and how to write back.

If you want northward to see "Engineering Value" (e.g., register contains scaled integer), please use Point's **Transform** (logical semantics):

- `transformDataType`: logical data type (logical=wire if empty)
- `transformScale/transformOffset/transformNegate`: Numeric affine transformation

::: tip Recommended Reading For full explanation, uplink/downlink links, min/max value range, and large integer/non-numeric limits, see: [Data Types and Transform Configuration](../data-types-transform.md). :::

::: tip 0-based vs 1-based address problem (Must Read)

The `address` in the driver here is **Protocol Layer 0-based Address** (UI validates min 0). But many manufacturer manuals use 1-based or "Logical Address" like 4xxxx/3xxxx.

You need to convert manual address to 0-based:

- If manual says **40001 corresponds to 1st Holding Register**, then protocol address is usually `0` (40001-40001).
- If manual directly gives "Register Offset 0/1", follow manual definition.

It is recommended to use a "Known Fixed Value" point for validation (e.g., Device Model/Firmware Version register), calibrate the address system first, then model in bulk. :::

::: tip How to calculate quantity

The meaning of `quantity` depends on `functionCode`:

- **Coils/DiscreteInputs**: Unit is **bit** (Coil count)
- **Holding/InputRegisters**: Unit is **word (16-bit)**

Register scalar quantity must exactly match its wire type. Invalid, missing or zero quantities are rejected before I/O. Variable fields are fully assembled across PDUs; no prefix truncation or implicit promotion is applied. :::

### 2.4 Action Configuration

Action is used to encapsulate a set of "Write Coil/Write Register" operations.

- **`functionCode`**:
  - `WriteSingleCoil(0x05)` / `WriteMultipleCoils(0x0F)`
  - `WriteSingleRegister(0x06)` / `WriteMultipleRegisters(0x10)`
- **`address`**: Start address
- **`quantity`**: Write quantity

::: tip Automatic Function Code Inference For northward `write_point` (Single Point Write) operation, if the point defines a read function code (e.g., `ReadHoldingRegisters`), the driver will automatically infer the write function code based on `quantity`:

- `quantity = 1` -> `WriteSingleRegister` (0x06)
- `quantity > 1` -> `WriteMultipleRegisters` (0x10) :::

## 3. Data Type Mapping Table (Smart Codec)

The driver has a built-in powerful codec supporting flexible conversion from register stream to strongly typed values.

### 3.1 Register Types (0x03/0x04)

| Wire `dataType` | Exact quantity | Behavior |
| --- | --: | --- |
| Boolean, Int16, UInt16 | 1 | Complete 16-bit word |
| Int32, UInt32, Float32 | 2 | Complete 32-bit scalar |
| Int64, UInt64, Float64, Timestamp | 4 | Complete 64-bit scalar; Timestamp is signed epoch milliseconds |
| String, Binary | Explicit N | Complete original field, including multi-PDU assembly |

UInt8/Int8 byte lanes and Int128 wire fields are unqualified. Logical narrow/wide integer conversion uses an explicit supported wire type and `transformDataType`. Floating NaN/infinity and unsafe affine conversion of integers above2^53 are rejected.

::: warning "Fixed Length Block + Padding" Convention for String Points (Must Read) Modbus protocol itself does not have a "String Register" type. `String` reading relies entirely on **Device side data storage convention**. Current driver behavior for `String` is:

- Restore `quantity` registers into byte stream according to `byteOrder/wordOrder`;
- Then only **remove trailing consecutive `0x00`** (Remove tail `\0` padding), then decode as UTF-8 (Invalid UTF-8 is rejected).

Therefore you need to pay special attention:

- **`quantity` must be sufficient**: Unit is register (word, 2 bytes). E.g., "String length 10 bytes" usually needs `quantity = 5`.
- **Device write suggests "Full Overwrite + 0x00 Padding"**: Fill the entire fixed-length register block; pad remaining part with `0x00`.
  - Ex: Fixed length 10 registers (20 bytes) storing `"a"`, suggest writing `0x61 0x00` then pad remaining 18 bytes with `0x00`.
- **Do not just write `a\0` and leave remaining registers uncleared**: If tail has old data and not `0x00`, driver will not truncate at first `0x00`, may appear as `"a\0xxxx..."` (Containing invisible characters/dirty tail), looking like "String incorrect".

If field device cannot guarantee clearing tail, suggest unifying "Fixed Length Block 0 Padding" protocol on device side (or host computer write side); and first verify `byteOrder/wordOrder` correctness with a known string register. :::

::: details Explicit wire/logical Transform Example: Device has a temperature value, actually `Int16` (255 = 25.5°C), but you defined it as `Float32` in platform.

- Configuration (Recommended "wire/logical semantics separation"):
  - `dataType=Int16` (wire)
  - `transformDataType=Float64` (logical)
  - `quantity=1`
  - `transformScale=0.1`
- Driver Behavior: Read 1 word -> Parse as i16(wire) -> Apply Transform wire→logical -> Output 25.5 :::

### 3.2 Coil Types (0x01/0x02)

| DataType    | quantity | Description           |
| :---------- | :------- | :-------------------- |
| **Boolean** | 1        | Single bit read/write |

Every coil/discrete-input point is a single Boolean with quantity1. Arrays are unqualified.

## 4. Batch Read/Write Planning Algorithm

The pure planner admits the complete original Unit ID group, sorts function/address deterministically, merges range unions, then segments them into legal PDUs. Aliases share original reads; complete fields are assembled before byte/word order and one SDK Transform. `maxGap*` counts unmapped addresses, so zero allows overlap and adjacency. Invalid limits are rejected rather than changed.

Native work budgets default to `maxPlanningInputs=4096`, `maxPlanningReferences=65536`, `maxCollectionBytes=16777216`. Any PDU failure fails the logical collection without publishing buffer defaults. See [batching](./batching.md).

### 4.1 Performance Tuning Suggestions

- **High Throughput Mode**:
  - Register: `maxGapRegisters` = 1~10, `maxBatchRegisters` = 100~125
  - Bit: `maxGapBits` = 16~200, `maxBatchBits` = 512~2000
  - Applicable: Concentrated point addresses, good network quality (TCP).

- **High Stability Mode**:
  - Register: `maxGapRegisters` = 0 (No gap crossing), `maxBatchRegisters` = 40~80
  - Bit: `maxGapBits` = 0 (No gap crossing), `maxBatchBits` = 128~512
  - Applicable: RS-485 high interference, slow device response.

## Clean migration

Configure every original quantity explicitly and use exact scalar widths. Remove retired `tcpPoolSize`/`maxTimeouts` fields. Timestamp uses four words of signed milliseconds; select a numeric wire type and explicit logical Transform for other device encodings. String is strict UTF-8 and overlong writes are rejected. Successful exact echoes mean service acceptance; absent/mismatched echoes retain uncertainty, and controls are never automatically replayed.
