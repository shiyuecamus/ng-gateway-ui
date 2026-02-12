---
title: 'Group Collection Design & Driver Usage'
description: 'Explain what group collection is, why it is needed, how Collector groups and handles concurrency, design details of CollectionGroupKey, and how drivers like Modbus/S7/MC/OPC UA/EtherNet-IP use it.'
---

# Group Collection Design & Driver Usage

Group Collection is a mechanism designed specifically for `High Throughput Polling Collection` in the southward system. Its goal is not "to let you configure fewer devices", but:

-   **While maintaining business modeling flexibility** (Can split the same physical device into multiple business Devices)
-   **Maximize protocol-side batch capabilities** (Reduce request counts, reduce session/handshake overhead, reduce scheduling overhead)
-   And maintain **stable backpressure and timeout semantics** (Group-level timeout, concurrency limit, controllable cancellation)

---

## 1. Why do you need group collection

A very common modeling method in the field is:

-   One physical connection (One PLC / One OPC UA endpoint / One EtherNet-IP session / One Modbus slave)
-   But for business organization/permission/asset modeling, points are split into multiple "Business Devices" (Multiple Devices)

If the driver performs "One collection per business device":

-   Protocol request count explodes
-   Connection reuse worsens (Especially for protocols requiring session/auth/handshake)
-   Tokio task scheduling overhead explodes
-   Backpressure/Timeout/Retry granularity becomes unstable

Therefore, we introduce group collection: Let the core be responsible for grouping devices according to "Physical Collection Semantics", and the driver is responsible for making **Batch Read/Write Plans** within the group, and finally outputting by business device.

---

## 2. How Collector Works

### 2.1 Input: CollectItem

The input from Collector to driver is not a "Point List", but a `CollectItem` list:

-   Each `CollectItem` represents a **Business Device** and its Points:
    `(RuntimeDevice, [RuntimePoint])`

### 2.2 Grouping: CollectionGroupKey

Collector will call the following for each device:

-   `collection_group_key(device) -> Option<CollectionGroupKey>`

Grouping Semantics:

-   Returns `None`: This device does not participate in physical grouping, Collector guarantees it will be called individually once (`items.len()==1`)
-   Returns `Some(key)`: Collector will merge multiple devices with the same key into one `collect_data(items)` call

### 2.3 Design of CollectionGroupKey

`CollectionGroupKey` is a fixed-size, hashable, allocation-free key:

-   Total length 16 bytes
-   `[0..4)`: `kind` namespace (big-endian u32)
-   `[4..16)`: Protocol custom payload (12 bytes)

The purpose of this design:

-   **Hot path friendly**: Can be used as `HashMap` key, avoiding `String` allocation
-   **Cross-driver safety**: Different protocols can use different `kind` to avoid collision
-   **Sufficient expressiveness**: payload allows putting `u64`, two `u48`, arbitrary 12 bytes or hash prefix

SDK provides constructors (Available for driver development):

-   `from_u64(kind, v)`
-   `from_pair_u64(kind, a, b)` (Truncate to 48-bit, suitable for "Two IDs" scenario)
-   `from_bytes(kind, payload12)`
-   `from_hash128(kind, hash128)`

::: tip Rule of Thumb: Key must be "Stable and Express Physical Session Semantics"
The meaning of the key should be "These business devices can share one physical batch read/same session context".
For example, Modbus uses slaveId; S7/OPC UA/MC/EtherNet-IP mostly use channelId (Same channel shares connection/session).
:::

### 2.4 Execution: Call driver.collect_data by group

Collector will turn each group into one driver call:

-   For each key group: `driver.collect_data(items_in_group)`
-   For each None (Single device): `driver.collect_data([single_item])`

Concurrency and Timeout Semantics:

-   **Group-level timeout**: One `collect_data(group)` has a unified timeout budget (Not "One timeout per device")
-   **Global concurrency limit**: Control in-flight group count via semaphore + `buffer_unordered`
-   **Cancellable**: When channel is disabled/gateway is closed, group collection will be cancelled

### 2.5 Output: Must output by business device

Even if the driver merges collection of multiple business devices in one group call, **output must still be split by business device**:

-   `NorthwardData`'s `device_id/device_name` must correspond to the business device
-   Recommend using the same `timestamp` for the same group (Guarantee data consistency in this round)

---

## 3. Usage Scenarios and Design Considerations

### 3.1 When to group

Only when satisfying:

-   These business devices **share the same physical session semantics** (Share connection/Share auth/Share serialization constraints)
-   Merged collection can significantly reduce protocol overhead (Batch read/Batch write)
-   Merging does not introduce "Mutual Dragging" to an unacceptable level (e.g., one extremely slow device causes the whole group to timeout)

### 3.2 When NOT to group

For example:

-   Each business device must exclusively occupy a connection (Different IP/Port/Serial Port)
-   Protocol layer naturally does not support batch (Or batch is unstable instead)
-   Merging causes error semantics expansion (One illegal point causes the whole batch to fail, and device fault tolerance is poor)

### 3.3 What if the group is too large (Throughput vs Stability)

Risks of in-group merging are mainly:

-   **Timeout Amplification**: Any slow point in the group may drag down the whole group
-   **Failure Impact Expansion**: One batch failure affects more points
-   **Memory/CPU Peak**: One group collection needs to process more points simultaneously

Suggestion:

-   Driver does "Sub-batching" within the group (e.g., Modbus planner, EtherNet/IP chunk, OPC UA batch read)
-   Reasonably configure Collector's `collection_timeout_ms` and concurrency limit

### 3.4 Stability and Collision of Key

Key must be:

-   **Stable**: Do not use random numbers, do not use temporary values that change on restart
-   **Express Physical Semantics**: Do not use `device_id` only (That equals no grouping)
-   **Avoid Collision**:
    -   `kind` uses ASCII constants (e.g., `"MODB"`/`"S7CH"`)
    -   payload uses identifier that uniquely represents this physical session (slaveId/channelId/endpoint hash)
