---
title: 'Writeback Link & StatusCode Mapping'
description: 'How OPC UA Write converts to gateway WritePoint, waits for WritePointResponse; how errors map to OPC UA StatusCode.'
---

## 1. Writeback Link

When OPC UA client executes Write on a point Variable:

1.  Server only allows writing `AttributeId::Value`
2.  Reverse lookup point_id by NodeId
3.  Validate if point is writable (access_mode = Write/ReadWrite)
4.  Strict type matching (Variant type must correspond to point data_type)
5.  Send `NorthwardEvent::WritePoint` to core (With timeout_ms)
6.  Wait for `NorthwardData::WritePointResponse`
7.  Update value of that variable in AddressSpace on success, and notify subscribers

---

## 2. Type Matching

Current writeback is strict type matching, no automatic conversion like "String to Number".

Example:

-   point.data_type = `Float64` → Write must be OPC UA `Double`
-   point.data_type = `Boolean` → Write must be OPC UA `Boolean`

::: warning
If client write type mismatch, returns `BadTypeMismatch` (or `BadInvalidArgument`).
:::

---

## 3. Error to StatusCode Mapping

| Gateway Error | Typical Cause | StatusCode (Indicative) |
| :--- | :--- | :--- |
| NotFound(node_id/point) | NodeId not found or point deleted | `BadNodeIdUnknown` |
| NotFound(action) | Point exists but no corresponding write action | `BadNotWritable` |
| NotConnected | Device/Channel not connected | `BadNotConnected` |
| Timeout | Write timeout (Queue wait or driver timeout) | `BadTimeout` |
| ValidationFailed(type mismatch) | Type mismatch | `BadTypeMismatch` |
| ValidationFailed(out of range) | Out of range | `BadOutOfRange` |
| ValidationFailed(not writeable) | Not writable point | `BadUserAccessDenied` |

---

## 4. Write Timeout

Configuration item:

-   `writeTimeoutMs` (Default 5000)

It constrains:

-   Wait in core write serial queue
-   Southward driver write timeout
