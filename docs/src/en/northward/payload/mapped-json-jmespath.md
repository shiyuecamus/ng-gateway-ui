---
title: 'JMESPath Quick Reference (MappedJson)'
description: 'Provide common JMESPath syntax quick reference and examples for MappedJson.'
---

## 1. Basic Selection

-   Get field: `device.name`
-   Get nested field: `app.plugin_type`
-   Get first of array: `data.values[0]`

## 2. Filter and Projection (Common)

-   Filter: `items[?type=='telemetry']`
-   Projection: `items[].name`

## 3. Common Ways of Combined Output

JMESPath returns JSON value, you can write the result directly to an out_path.

::: tip
If you find yourself "Wanting to concat strings/do complex calculation", this usually means you need stronger Transform (Not supported yet).
You can output necessary fields to JSON first, then handle on platform side.
:::
