---
title: 'Mitsubishi MC'
description: 'NG Gateway Mitsubishi MC Protocol Southward Driver: PLC Series, Batch Read/Write/Frame Size/Concurrency Tuning, MC Address Syntax and Data Type Mapping.'
---

## 1. Protocol Introduction and Common Scenarios

Mitsubishi PLC's MC protocol (MELSEC Communication Protocol) is commonly used to read/write registers/coils (devices) of Mitsubishi PLCs (A/QnA/Q/L/iQ-R etc.). Different series have differences in frame format and batch capabilities.

NG Gateway MC driver connects to PLC as a client, performs batch read/write via MC addresses (e.g., `D100`, `X1A0`, `D20.2`), and maps results to unified `NGValue`.

## 2. Configuration Model: Channel / Device / Point / Action

### 2.1 Channel Configuration

MC Channel configuration (Editable fields) is defined by `@ng-gateway-southward/mc/src/metadata.rs`, corresponding to runtime structure `McChannelConfig`:

-   **`host`**: PLC IP/hostname
-   **`port`**: Port (Default 5001, depends on field PLC/Gateway configuration)
-   **`series`**: PLC Series (A / QnA / Q/L / iQ-R)
-   **`maxPointsPerBatch`**: Max points per batch (Used for batch read/write planning)
-   **`maxBytesPerFrame`**: Max bytes per frame (Used to prevent frame from being too large)
-   **`concurrentRequests`**: Concurrent request count (Default 1, suggest increasing cautiously)

**Why series is needed**:

-   Different series correspond to different frame variants and batch limits (Driver will choose frame variant and limits accordingly).

### 2.2 Device Configuration

Driver layer device configuration is empty (device used for logical grouping).

:::: tip Grouped collection
When multiple business Devices exist under the same Channel, MC driver will enable **grouped collection**: Collector will merge points of these Devices into one `collect_data(items)` call, driver will merge points and execute batch read, then split into respective `NorthwardData` outputs by `device_id`.
::::

### 2.3 Point Configuration

Point driver configuration fields:

-   **`address`**: MC Address (Required)
-   **`stringLenBytes`**: String Length (Bytes, Optional, only used when `data_type=String` requires fixed length)

Address syntax details see `./addressing.md`.

### 2.4 Action Configuration

Action is used to encapsulate a set of "Write Address" operations; **Action itself does not carry protocol detail configuration**.

-   **Key Semantics**: MC write target address should be configured on **Action's `inputs(Parameter)`**, i.e., each parameter specifies the MC address to write via `Parameter.driver_config.address`.
-   **Usage Suggestion**:
    -   Single address write: Create an Action, put one parameter (one address) in inputs.
    -   Multi-address batch write: Define multiple parameters (multiple addresses) under the same Action, one RPC issue can complete multi-point writing.

Parameter-level driver configuration fields (Each input parameter):

-   **`address`**: MC Address (Required)
-   **`stringLenBytes`**: String Length (Bytes, Optional, only used when `data_type=String` requires fixed length)

## 3. Data Type Mapping Table (MC ↔ DataType)

Value encoding/decoding logic is located at `@ng-gateway-southward/mc/src/codec.rs` (`McCodec`), batch planning and "Word Length" rules in `mc/src/driver.rs::words_for_data_type`.

### 3.1 Point / Action Parameter Recommended Mapping (DataType → MC Word Length/Encoding)

> MC "Word" is 16-bit. Driver will calculate number of words to read/write based on `data_type` (String needs extra length).

| DataType | Word Count | Encoding | Description |
| :--- | :--- | :--- | :--- |
| Boolean | 1 | 1 byte (0/1) | Bit devices (X/Y/M etc.) recommend using only Boolean |
| Int8 / UInt8 | 1 | little-endian (Low byte valid) | Treated as 1 word |
| Int16 / UInt16 | 1 | little-endian | |
| Int32 / UInt32 / Float32 | 2 | little-endian | Float32 is IEEE754 |
| Int64 / UInt64 / Float64 | 4 | little-endian | Float64 is IEEE754 |
| String | ceil(stringLenBytes/2) | bytes | **Must** configure `stringLenBytes` (Same for Point and Action Parameter) |
| Binary | - | - | Not supported in current version (Point/Action will report config error) |
| Timestamp | - | - | Not supported in current version (Point/Action will report config error) |

### 3.2 Read Path (MC bytes → NGValue)

-   Numeric types use **little-endian** decoding (Compliant with MC binary spec).
-   `String`: Read fixed length bytes; driver does not auto trim, suggest agreeing on "0 termination/padding rules" on upper layer.

### 3.3 Write Path (NGValue → MC bytes)

Writing also uses little-endian encoding; suggest `data_type` consistent with target device real storage type, otherwise "Write in read back fails/Value incorrect" may occur.

:::: tip Best Practice
-   `String` strongly recommends clarifying `stringLenBytes` consistent with PLC side storage length, and agreeing on padding/truncation rules.
-   Bit devices (X/Y/M etc.) suggest using only `Boolean`, avoiding unpredictable semantics of "Writing bit as word".
::::

## 4. Advanced Documentation

-   `MC Address Syntax and Dec/Hex Rules`: See `./addressing.md`
-   `Batch Read/Write/Frame Size/Concurrency Tuning`: See `./batching.md`
