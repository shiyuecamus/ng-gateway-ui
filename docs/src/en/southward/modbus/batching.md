---
title: 'Modbus Batch Read/Write Planning & Performance Tuning'
description: 'Interpret Modbus driver batch merging algorithm (Register/Bit separated: maxBatch*/maxGap*), and tuning suggestions for throughput and stability in RS-485/TCP scenarios.'
---

## At What Stage Does Batch Merging Happen

When a Channel collects in Polling mode, the driver plans batch reads for readable points of each Device, trying to merge multiple points into fewer Modbus requests as much as possible. This process happens entirely in memory (`Planner` module) without generating network I/O.

## Merging Algorithm

For input point set:

1.  **Grouping**: Group by `functionCode` (e.g., Holding Registers and Input Registers are physically isolated areas and cannot be merged).
2.  **Sorting**: Sort by `address` ascending within group.
3.  **Greedy Merging**: Scan from low address, try to "absorb" adjacent points into current Batch:
    -   **Gap Check**: `(next_point.start - current_batch.end) <= maxGap*`
    -   **Span Check**: `(next_point.end - current_batch.start) <= maxBatch*`

If both conditions are met, merge, and extend batch `end` to `max(current_batch.end, next_point.end)`.

After merging, the driver will:
-   Send a read request (Start Address + quantity=span).
-   After receiving response, **Zero-Copy Slice** and decode from the large data block in memory according to each point's `address` and `quantity`.

## How to Set `maxGap*` / `maxBatch*`

-   **Register Read**: `maxBatchRegisters` (Unit: word), `maxGapRegisters` (Unit: word)
    -   Protocol hard limit: Max **125 words** per register read, driver will clamp `maxBatchRegisters`
-   **Bit Read**: `maxBatchBits` (Unit: bit), `maxGapBits` (Unit: bit)
    -   Protocol hard limit: `maxBatchBits <= 2000`

::: tip In a nutshell
-   `maxGap*` controls "How many holes allowed to cross"
-   `maxBatch*` controls "Total span of one request".
:::

### 1) Throughput First (Dense addresses, reliable devices)

-   **Register (0x03/0x04)**:
    -   **`maxGapRegisters`**: 1~10
    -   **`maxBatchRegisters`**: 100~125
-   **Bit (0x01/0x02)**:
    -   **`maxGapBits`**: 200~500
    -   **`maxBatchBits`**: 512~2000

**Effect**:
-   Fewest requests, highest bus utilization (Reduced protocol header overhead).
-   Suitable for Modbus TCP or high baud rate RS-485 environments.

**Risk**:
-   If there are "Illegal Addresses" in the device falling exactly in the Gap, some legacy devices might return Exception causing the whole Batch to fail.
-   Single response packet is large, slightly weaker anti-interference ability.

### 2) Stability First (Link jitter, occasional device timeout)

-   **Register (0x03/0x04)**:
    -   **`maxGapRegisters`**: 0 (Forbid crossing holes)
    -   **`maxBatchRegisters`**: 40~80
-   **Bit (0x01/0x02)**:
    -   **`maxGapBits`**: 0 (Forbid crossing holes)
    -   **`maxBatchBits`**: 128~512

**Effect**:
-   Only continuously defined points are merged.
-   Single failure affects small range, low retry cost.
-   Suitable for long distance RS-485 lines, sites with severe interference.

### 3) RS-485 Multi-Slave (Shared Bus)

RS-485 bottleneck is often bus time division and slave response time, not CPU:

-   **Do not blindly increase `maxBatch*`**: Overly large packets occupy bus too long, increasing error rate.
-   **Increase Collection Period (`period`)**: Give the bus time to "breathe".
-   **Configure `connection_policy`**:
    -   `read_timeout_ms`: Set to at least `(Expected Transmission Time + Device Processing Time) * 1.5`.
    -   `backoff`: Set backoff strategy to avoid "Thundering Herd Retry" blocking the bus completely after multiple devices drop offline simultaneously.

::: tip RTU Special Reminder
In RTU/RS-485 scenarios, the driver forces single connection (Single Flight), so `tcpPoolSize` brings no concurrency benefit. Prioritize throughput optimization from **Batch Planning** and **Collection Period**.
:::

## Common Troubleshooting

### 1) "Points all timeout/Occasionally all fail"

Prioritize checking:
-   `read_timeout_ms` too small (Serial port/Device response slow).
-   Slave actual `slaveId` inconsistent with configuration.
-   RS-485 field wiring/termination resistor/bias resistor/shield grounding issues.

### 2) "Low throughput, too many requests"

Prioritize checking:
-   Point `functionCode` scattered (Try to unify using register area for same physical area).
-   Single point `quantity` too large blocking merge (Suggest splitting).
-   `maxGapRegisters/maxGapBits` set to 0, causing addresses differing by only 1 unable to merge.
