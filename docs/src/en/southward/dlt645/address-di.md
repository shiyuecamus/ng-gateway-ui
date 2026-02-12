---
title: 'DLT645 Meter Address / DI / Decimals'
description: 'DL/T 645 meter address format, DI byte order and version differences (1997/2007), and how decimals/scale affect final reading.'
---

## 1) Meter Address

Driver requirement:

-   `address` is **12-digit numeric string** (e.g., `123456789012`)

The protocol layer will convert it to 6-byte BCD address (and handle low/high order).

::: tip Practical Suggestion
-   Base on the address displayed by field "Meter Reading Software/Master Station Tool", and verify if it responds correctly in the first collection.
:::

## 2) DI

DI is Data Identifier, used to specify "Which data item to read".

### 2.1 Version Differences

-   **DL/T 645-1997**: DI length is 2 bytes
-   **DL/T 645-2007**: DI length is 4 bytes

::: tip Byte Order and Filling Suggestion
UI requires DI as hex string:
-   2007: 8-digit hex (Example `02010100`)

Suggest basing on manufacturer manual/master station tool; if reading fails:
-   First confirm if DI needs "Low byte first" (Some materials display in Little Endian)
-   Compare DI byte order in request frame using packet capture/master station tool
:::

## 3) Relationship between decimals and scale

Decoding flow (High level):

1.  Protocol payload (BCD) → Decode as float `v` by `decimals`
2.  `v` → Force convert by Point's `data_type` (Int/Float/UInt)
3.  If `scale` is set, apply scaling factor further

::: tip Suggestion
-   If device manual explicitly gives "BCD decimal places", prioritize using `decimals` to express
-   `scale` is more suitable for expressing "Engineering Conversion" (e.g., 0.01)

> Note: Core's `min/max` validation does not automatically apply scale; please ensure configured min/max are on the same scale as external write value.
:::
