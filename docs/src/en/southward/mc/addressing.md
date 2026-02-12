---
title: 'MC Address Syntax'
description: 'MC address parsing rules: Device prefix (X/Y/M/D etc.), Decimal/Hexadecimal representation, and optional bit subscript (e.g., D20.2).'
---

## 1) What is Address Composed of

MC driver address parsing is in `@ng-gateway-southward/mc/src/protocol/frame/addr.rs`, address consists of three parts:

-   **Device Prefix**: e.g., `X`, `Y`, `M`, `D` (Specific supported set decided by `McDeviceType`)
-   **Head Number**: Device number, parsed according to that device's notation (Decimal or Hexadecimal)
-   **Optional Bit Subscript**: Like `.2` (Used for bit addressing, e.g., `D20.2`)

Example:

-   `D100`: D device, decimal 100
-   `X1A0`: X device, hexadecimal 1A0
-   `D20.2`: D device, head=20, bit=2

## 2) Decimal vs Hexadecimal

Different device prefixes use different number notations (Decided by `McNotation` in driver):

-   Some devices use Decimal (Dec)
-   Some devices use Hexadecimal (Hex)

If you find addresses like `X1A0` expressed in hex in manuals, please keep filling in hex form; driver will parse according to device convention.

## 3) Semantics of Bit Subscript

`.bit` is used for "Bit addressing within a word", common in:

-   Need to access a certain bit flag of a register (e.g., `D20.2`)

Note:

-   Bit subscript only does basic syntax validation (Whether it is a number)
-   Semantic constraints (Whether bit allowed, whether matches data_type) are handled at higher layer; suggest using `data_type=Boolean` for bit points

## 4) Common Errors

-   Address empty or missing head: e.g., `D`, `X`
-   Device prefix not supported: e.g., entered unimplemented device code
-   head/bit is not a number or hex format illegal
