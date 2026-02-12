---
title: 'DLT645'
description: 'NG Gateway DL/T 645 Southward Driver Usage & Configuration: 645-1997/2007, Serial/TCP, Meter Address/Password, DI, BCD Encoding/Decoding, and Best Practices.'
---

## 1. Protocol Introduction

DL/T 645 is a common protocol for domestic energy meters/multi-function meters, typical versions are **DL/T 645-1997** and **DL/T 645-2007** (Most common in the field). The protocol often runs on RS-485, and also often converted to TCP via serial server.

The goal of NG Gateway DLT645 driver is: Stably poll multiple meters on one bus, and decode readings corresponding to DI into unified `NGValue`.

## 2. Configuration Model

### 2.1 Channel Configuration

One RS-485 bus (or one TCP serial server connection) is modeled as a Channel.

#### 2.1.1 `version` (Protocol Version)

-   `DL/T 645-1997`
-   `DL/T 645-2007`

::: tip Version affects
-   DI length (1997: 2 bytes; 2007: 4 bytes)
-   Control code and some semantics
:::

#### 2.1.2 `connection.kind` (Connection Type)

-   **`Serial`**: Serial/RS-485 (Recommended for direct connection to 485 bus)
-   **`Tcp`**: TCP (Serial server/Gateway)

Serial Parameters (When `connection.kind = Serial`):

-   **`connection.port`**: Serial port path
-   **`connection.baud_rate`**: Baud rate
-   **`connection.data_bits`**: Data bits (Default 8)
-   **`connection.stop_bits`**: Stop bits (Default 1)
-   **`connection.parity`**: Parity

TCP Parameters (When `connection.kind = Tcp`):

-   **`connection.host`**: Host
-   **`connection.port`**: Port

#### 2.1.3 Advanced Parameters

-   `maxTimeouts`: Trigger reconnection after consecutive timeouts exceed this value (Default 3)
-   `wakeupPreamble`: Send preamble wakeup code (Default `[0xFE,0xFE,0xFE,0xFE]`)

::: tip Best Practice
-   In RS-485 scenarios, preamble wakeup code is a common compatibility strategy; if field device explicitly does not need it, can be configured as empty array to reduce bandwidth.
-   Timeout and Reconnection: Try not to set `maxTimeouts` to 1 (Prone to jitter reconnection), default 3 is usually more stable.
:::

### 2.2 Device Configuration

Each Device corresponds to a meter:

-   `address`: Meter address (12-digit number, example `123456789012`)
-   `password`: Password (Default `00000000`, generally hex string)
-   `operatorCode`: Operator code (Optional)

::: tip
For detailed explanation of Address/DI, see [DL/T Address Syntax](./address-di.md).
:::

### 2.3 Point Configuration

-   `di`: Data Identifier (2007 usually 8-digit hex; 1997 uses low 16-bit)
-   `decimals`: Decimal places (Optional, used for BCD decoding)

Point's `data_type` affects forced type conversion and `scale` after BCD decoding.

### 2.4 Action Configuration

Action is used to encapsulate a set of "Write Meter/Control/Maintenance Command" operations; **Action itself does not carry protocol detail configuration**.

-   **Key Semantics**: DL/T 645 control code/DI/decimal places and other protocol details should be configured on **Action's `inputs(Parameter)`**, i.e., each parameter specifies the function and encoding details via `Parameter.driver_config`.

Parameter-level driver configuration fields (Each input parameter):

-   **`functionCode`**: Required. Function Code as follows:

    | Enum Name | Description |
    | :--- | :--- |
    | `BroadcastTimeSync`| Broadcast Time Sync |
    | `ReadData` | Read Data |
    | `ReadNextData` | Read Next Data |
    | `ReadAddress` | Read Communication Address |
    | `WriteData` | Write Data |
    | `WriteAddress` | Write Communication Address |
    | `Freeze` | Freeze Command |
    | `UpdateBaudRate` | Update Baud Rate |
    | `ModifyPassword` | Modify Password |
    | `ClearMaxDemand` | Clear Max Demand |
    | `ClearMeter` | Clear Meter |
    | `ClearEvents` | Clear Events |

-   **`di`**: Optional. Some actions need to specify DI (e.g., "Write a data item"); actions not needing DI can omit.
-   **`decimals`**: Optional. Decimal places for numeric BCD encoding/decoding (Default strategy see table below).

## 3. Data Type Mapping Table

### 3.1 Point (Uplink) Recommended Mapping

Most DL/T 645 readings are BCD (0x33 offset removed):

-   Driver will first **BCD → f64**, then force convert according to Point's `data_type`, and apply `scale` (if configured).
-   `decimals` controls BCD decoding decimal places (Default strategy: Numeric defaults to 0 or 2, see table below).

| DataType | Recommended Scenario | Decoding Rule (Implementation Semantics) | Remark |
| :--- | :--- | :--- | :--- |
| Float32 / Float64 | Most "Readings/Energy/Power/Voltage" etc. | BCD → f64 → Float (Apply `scale`) | **Most Recommended**, least prone to pitfalls |
| Int8/16/32/64 | Field explicitly signed integer reading | BCD → f64 → Integer (Apply `scale`) | Watch for overflow and decimal places |
| UInt8/16/32/64 | Count/Sequence/Unsigned reading | BCD → f64 → Unsigned Integer (Apply `scale`) | Watch for overflow |
| Boolean | Status bit/Switch (Implemented as bit0) | `payload[0] & 0x01 != 0` | Only suitable for data items with clear 0/1 semantics |
| String | Meter returns printable text | Try UTF-8/ASCII; trim trailing 0; fallback Binary on failure | |
| Binary | Raw bytes | Raw bytes | Use when unsure of encoding or upper layer parsing needed |
| Timestamp | **Use with caution** | Current implementation treats BCD value as timestamp numeric value and force converts (i64 ms) | If device returns "YYMMDDhhmmss" format, do not use Timestamp; please use String/Binary and convert on edge side |

### 3.2 Action Parameter (Downlink) DataType Selection (Write Encoding)

DL/T 645 action write uses `Dl645Codec::encode_parameter_value`, with explicit whitelist for DataType:

| Parameter.data_type | Supported | Default decimals | Encoding Rule |
| :--- | :--- | :---: | :--- |
| Float32 / Float64 | ✅ | 2 | Numeric → BCD (Signed) |
| Int8/16/32/64 | ✅ | 0 | Numeric → BCD (Signed) |
| UInt8/16/32/64 | ✅ | 0 | Numeric → BCD (Unsigned) |
| Boolean | ✅ | - | 0x00 / 0x01 |
| String | ✅ | - | Raw bytes (UTF-8/ASCII) |
| Binary / Timestamp | ❌ | - | Driver returns config error |

::: tip Best Practice
-   **Write value range must be clear**: DL/T 645 Action write does not automatically apply `scale` (scale is Point metadata); you need to write the value expected by the device directly (and control BCD decimal places with `decimals`).
-   **Use Float if possible**: Prefer Float32/Float64 for reading points, reducing problems caused by "Integer Overflow/Truncation/Decimal Places".
:::
