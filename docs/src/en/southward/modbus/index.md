---
title: 'Modbus'
description: 'NG Gateway Modbus Southward Driver Usage & Configuration: TCP/RTU, Point Modeling, Byte/Word Order, Smart Cast, Batch Read/Write, and Best Practices.'
---

## 1. Protocol Introduction

Modbus is a classic industrial field communication protocol, with common forms including **Modbus TCP** (Ethernet) and **Modbus RTU** (Serial/RS-485). It uses "Register/Coil" as core abstractions:

-   **Coils**: bit (Usually Read/Write)
-   **Discrete Inputs**: bit (Usually Read-Only)
-   **Holding Registers**: 16-bit register (Usually Read/Write)
-   **Input Registers**: 16-bit register (Usually Read-Only)

NG Gateway Modbus driver adopts a **Fully Asynchronous, Zero-Copy** architecture, performing batch read/write of points with high throughput and low overhead on the gateway side. Supports **Smart Cast** (Intelligent Type Conversion) and **Automatic Batch Planning**.

## 2. Configuration Model

### 2.1 Channel Configuration

Channel is the boundary of "Connection and Session": **The same TCP connection or the same RS-485 serial line** should be modeled as a Channel.

#### 2.1.1 `connection.kind` (Connection Type)

-   **tcp**: Modbus TCP
-   **rtu**: Modbus RTU (Serial)

#### 2.1.2 TCP Parameters (When `connection.kind = tcp`)

-   **`connection.host`**: Remote host (IPv4 or hostname, excluding schema/port)
-   **`connection.port`**: Port, default `502`

::: tip Suggestion
-   Field devices mostly have fixed IPs, it is recommended to fill in IP directly; avoid extra uncertainty introduced by DNS resolution.
:::

#### 2.1.3 RTU Parameters (When `connection.kind = rtu`)

-   **`connection.port`**: Serial port path
    -   Linux Example: `/dev/ttyUSB0`
    -   Windows Example: `COM3`
-   **`connection.baudRate`**: Baud rate (Default 9600)
-   **`connection.dataBits`**: Data bits (5/6/7/8, Default 8)
-   **`connection.stopBits`**: Stop bits (1/2, Default 1)
-   **`connection.parity`**: Parity (None/Odd/Even, Default None)

#### 2.1.4 `byteOrder` / `wordOrder`

Modbus register is a 16-bit word; when point data type is 32/64-bit, it spans multiple registers. Different devices have differences in "Byte/Word Order" implementation:

-   **`byteOrder`**: Order of two bytes inside a register (BigEndian/LittleEndian)
-   **`wordOrder`**: Order of words when multiple registers are used (BigEndian/LittleEndian)

::: tip **Typical Combinations**:

-   Common PLC: `byteOrder=BigEndian`, `wordOrder=BigEndian`
-   Some devices (Especially legacy devices) use "Word Swap" for 32-bit/64-bit: `wordOrder=LittleEndian`

Suggest confirming in host computer/manufacturer manual; if the read float value is "obviously absurd", prioritize checking byte/word order.
:::

#### 2.1.5 `tcpPoolSize`

`tcpPoolSize` is used to improve Modbus TCP throughput: The driver maintains a TCP connection pool, and selects connections in a round-robin manner within the pool during collection, thereby allowing multiple requests in flight (Still subject to core concurrency and driver internal planning constraints).

-   **Default Value**: `1`
-   **Recommended Range**: `1..=32` (Too large usually yields insignificant benefits and increases PLC/Gateway resource consumption)

::: warning
Only effective for `connection.kind=tcp`; RTU will force single flight (Effective value=1). When you configure `tcpPoolSize > 32`, the driver will clamp to `32` at runtime.
:::

#### 2.1.6 Batch Read Planning Parameters

| Field | Scope | Default | Description |
| :--- | :--- | :--- | :--- |
| `maxBatchRegisters` | 0x03/0x04 (Register Read) | 120 | Max span (number of words) for a single read request. **Protocol hard limit <=125**, driver will clamp |
| `maxGapRegisters` | 0x03/0x04 (Register Read) | 1 | Max "Gap" (word address difference) allowed when merging adjacent points |
| `maxBatchBits` | 0x01/0x02 (Bit Read) | 2000 | Max span (number of bits) for a single read request. **Protocol hard limit <=2000** |
| `maxGapBits` | 0x01/0x02 (Bit Read) | 500 | Max "Gap" (bit address difference) allowed when merging adjacent points |

::: warning
`maxBatch*` represents "Total quantity of a range read" (span), not "Number of points".
:::

### 2.2 Device Configuration

Device represents a Slave.

-   **`slaveId`**: Slave ID (0-255)

#### 2.2.1 Group collection

Modbus driver enables **group collection** in Polling collection path, grouping key is `slaveId`:

-   **Same `slaveId`**: Collector will merge multiple business Devices into one `collect_data(items)` call, driver will merge points and execute batch read (read request count closer to theoretical minimum), then split into respective `NorthwardData` outputs by business `device_id`.
-   **Different `slaveId`**: Will be split into different groups for separate collection.

### 2.3 Point Configuration

-   **`functionCode`**:
    -   `ReadCoils(0x01)` / `ReadDiscreteInputs(0x02)`
    -   `ReadHoldingRegisters(0x03)` / `ReadInputRegisters(0x04)`
-   **`address`**: Start address (0..65535, **0-based**)
-   **`quantity`**: Read quantity (Coil bit count or Register word count)

#### 2.3.1 wire/logical data type & Transform (Must Read)

Modbus `dataType` is **wire data type (Protocol/Memory layout semantics)**: It determines how the driver decodes from register/coil and how to write back.

If you want northward to see "Engineering Value" (e.g., register contains scaled integer), please use Point's **Transform** (logical semantics):

-   `transformDataType`: logical data type (logical=wire if empty)
-   `transformScale/transformOffset/transformNegate`: Numeric affine transformation

::: tip Recommended Reading
For full explanation, uplink/downlink links, min/max value range, and large integer/non-numeric limits, see:
[Data Types and Transform Configuration](../data-types-transform.md).
:::

::: tip 0-based vs 1-based address problem (Must Read)

The `address` in the driver here is **Protocol Layer 0-based Address** (UI validates min 0). But many manufacturer manuals use 1-based or "Logical Address" like 4xxxx/3xxxx.

You need to convert manual address to 0-based:

-   If manual says **40001 corresponds to 1st Holding Register**, then protocol address is usually `0` (40001-40001).
-   If manual directly gives "Register Offset 0/1", follow manual definition.

It is recommended to use a "Known Fixed Value" point for validation (e.g., Device Model/Firmware Version register), calibrate the address system first, then model in bulk.
:::

::: tip How to calculate quantity

The meaning of `quantity` depends on `functionCode`:

-   **Coils/DiscreteInputs**: Unit is **bit** (Coil count)
-   **Holding/InputRegisters**: Unit is **word (16-bit)**

For register reads, it is recommended to calculate `quantity` by `data_type` (See **3. Data Type Mapping Table**). If quantity is too small, the driver will try to perform **Smart Cast** (e.g., read 1 word convert to Float32); if too large, it will truncate or pad.
:::

### 2.4 Action Configuration

Action is used to encapsulate a set of "Write Coil/Write Register" operations.

-   **`functionCode`**:
    -   `WriteSingleCoil(0x05)` / `WriteMultipleCoils(0x0F)`
    -   `WriteSingleRegister(0x06)` / `WriteMultipleRegisters(0x10)`
-   **`address`**: Start address
-   **`quantity`**: Write quantity

::: tip Automatic Function Code Inference
For northward `write_point` (Single Point Write) operation, if the point defines a read function code (e.g., `ReadHoldingRegisters`), the driver will automatically infer the write function code based on `quantity`:
-   `quantity <= 1` -> `WriteSingleRegister` (0x06)
-   `quantity > 1` -> `WriteMultipleRegisters` (0x10)
:::

## 3. Data Type Mapping Table (Smart Codec)

The driver has a built-in powerful codec supporting flexible conversion from register stream to strongly typed values.

### 3.1 Register Types (0x03/0x04)

| DataType | Recommended quantity (words) | Decoding Behavior | Smart Cast (Degrade Compatibility) |
| :--- | :--- | :--- | :--- |
| **Boolean** | 1 | First word != 0 is true | - |
| **Int16** | 1 | Standard 16-bit signed integer | Read 4 words (i64) truncate to i16 |
| **UInt16** | 1 | Standard 16-bit unsigned integer | Read 4 words (u64) truncate to u16 |
| **Int32** | 2 | Standard 32-bit signed integer | If quantity=1, read i16 and promote to i32 |
| **UInt32** | 2 | Standard 32-bit unsigned integer | If quantity=1, read u16 and promote to u32 |
| **Float32** | 2 | IEEE754 Single Precision Float | If quantity=1, read i16 and convert to f32 |
| **Float64** | 4 | IEEE754 Double Precision Float | If quantity=2, read f32 and convert to f64 |
| **Int64** | 4 | Standard 64-bit signed integer | If quantity=2, read i32 and promote to i64 |
| **UInt64** | 4 | Standard 64-bit unsigned integer | If quantity=2, read u32 and promote to u64 |
| **Timestamp** | **2 or 4** | **4 words (8 bytes)**: Parse as i64 millisecond timestamp<br>**2 words (4 bytes)**: Parse as u32 second timestamp and auto multiply by 1000 | - |
| **String** | N | UTF-8 String, auto remove trailing `\0` | - |
| **Binary** | N | Raw byte stream | - |

::: warning "Fixed Length Block + Padding" Convention for String Points (Must Read)
Modbus protocol itself does not have a "String Register" type. `String` reading relies entirely on **Device side data storage convention**. Current driver behavior for `String` is:

-   Restore `quantity` registers into byte stream according to `byteOrder/wordOrder`;
-   Then only **remove trailing consecutive `0x00`** (Remove tail `\0` padding), then decode as UTF-8 (Invalid bytes will be shown as replacement characters).

Therefore you need to pay special attention:

-   **`quantity` must be sufficient**: Unit is register (word, 2 bytes). E.g., "String length 10 bytes" usually needs `quantity = 5`.
-   **Device write suggests "Full Overwrite + 0x00 Padding"**: Fill the entire fixed-length register block; pad remaining part with `0x00`.
    -   Ex: Fixed length 10 registers (20 bytes) storing `"a"`, suggest writing `0x61 0x00` then pad remaining 18 bytes with `0x00`.
-   **Do not just write `a\0` and leave remaining registers uncleared**: If tail has old data and not `0x00`, driver will not truncate at first `0x00`, may appear as `"a\0xxxx..."` (Containing invisible characters/dirty tail), looking like "String incorrect".

If field device cannot guarantee clearing tail, suggest unifying "Fixed Length Block 0 Padding" protocol on device side (or host computer write side); and first verify `byteOrder/wordOrder` correctness with a known string register.
:::

::: details
Smart Cast Example Scenario: Device has a temperature value, actually `Int16` (255 = 25.5°C), but you defined it as `Float32` in platform.

-   Configuration (Recommended "wire/logical semantics separation"):
    -   `dataType=Int16` (wire)
    -   `transformDataType=Float64` (logical)
    -   `quantity=1`
    -   `transformScale=0.1`
-   Driver Behavior: Read 1 word -> Parse as i16(wire) -> Apply Transform wire→logical -> Output 25.5
:::

### 3.2 Coil Types (0x01/0x02)

| DataType | quantity | Description |
| :--- | :--- | :--- |
| **Boolean** | 1 | Single bit read/write |
| **Telemetry/Attribute** | N | Driver will map read bit array to corresponding points. Currently recommend quantity=1 per point corresponding to one bit. |

## 4. Batch Read/Write Planning Algorithm

The driver has a built-in `Planner` module responsible for aggregating scattered point requests into optimal Modbus PDUs.

1.  **Grouping**: Group by `functionCode` (0x03 and 0x04 cannot be merged).
2.  **Sorting**: Sort by `address` ascending within group.
3.  **Scan & Merge**:
    -   Register Read (0x03/0x04): As long as `(next_addr - current_end) <= maxGapRegisters` and `(new_end - current_start) <= maxBatchRegisters`, merge into one request (Subject to protocol limit clamp).
    -   Bit Read (0x01/0x02): As long as `(next_addr - current_end) <= maxGapBits` and `(new_end - current_start) <= maxBatchBits`, merge into one request.
    -   Merge will produce "Hole Data", which will be read but discarded during decoding phase.

### 4.1 Performance Tuning Suggestions

-   **High Throughput Mode**:
    -   Register: `maxGapRegisters` = 1~10, `maxBatchRegisters` = 100~125
    -   Bit: `maxGapBits` = 16~200, `maxBatchBits` = 512~2000
    -   Applicable: Concentrated point addresses, good network quality (TCP).

-   **High Stability Mode**:
    -   Register: `maxGapRegisters` = 0 (No gap crossing), `maxBatchRegisters` = 40~80
    -   Bit: `maxGapBits` = 0 (No gap crossing), `maxBatchBits` = 128~512
    -   Applicable: RS-485 high interference, slow device response.
