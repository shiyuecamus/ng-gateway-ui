---
title: 'Node Mapping & NodeId Rules'
description: 'OPC UA AddressSpace hierarchy, NodeId string rules, sanitize strategy, and security boundary of "Expose only subscribed points".'
---

## 1. AddressSpace Hierarchy

Root Node:

-   `Objects/NG-Gateway`

Hierarchy Structure:

-   `Objects/NG-Gateway/{channel}/{device}/{point}`

Where:

-   `{channel}` uses `channel_name` as browse name
-   `{device}` uses `device_name`
-   `{point}` uses `point_key`

---

## 2. NodeId Rules

Each point Variable uses String NodeId:

```text
ns=1;s={channel}.{device}.{point_key}
```

Each component will be sanitized:

-   Allowed: `[A-Za-z0-9._-]`
-   Other characters replaced by `-`

::: warning Important: Do not change sanitize strategy arbitrarily
Once changed, NodeId/mapping saved on client side will become invalid (Breaking change).
:::

---

## 3. DataType and AccessLevel Mapping

-   Variable `DataType` mapped from point `data_type`
-   `AccessLevel` mapped from point `access_mode`:
    -   Read → CURRENT_READ
    -   Write → CURRENT_WRITE
    -   ReadWrite → READ|WRITE

---

## 4. Expose "Subscribed Points" Only

Current implementation intentionally avoids "Exposing all gateway points":

-   Nodes are created on demand when processing Telemetry/Attributes (lazy)
-   Runtime delta (Point add/delete/modify) only updates "Points already existing in local cache"

This means:

-   Unsubscribed/Unrouted data points will not suddenly appear in OPC UA Server
-   You need to create AppSubscription first and ensure data enters this App
