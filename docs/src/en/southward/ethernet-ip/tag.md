---
title: 'EtherNet/IP Tag Modeling & Limitations'
description: 'How to correctly fill tagName, how to handle Program scope, current driver limitations on Array/Structure and alternative modeling strategies.'
---

## 1) How to Write Tag Name

`tagName` of Point/Action is the PLC variable name (Defined by PLC program). Common forms:

-   **Controller Scope**: `MyTag`
-   **Program Scope**: `Program:Main.MyTag`

Naming style may differ across projects; suggest confirming variable path with vendor tools, and verifying read/write path with a "Simple Scalar Tag" first.

## 2) Array / UDT / Structure Support Status

Current Version:

-   Scalar Type: Supported
-   UDT/Structure/Array etc. Complex Types: Will return "Unsupported PlcValue type ..."

::: tip
If you wish gateway side to directly support mapping Structure/Array to JSON/Binary, we can extend in future versions.
:::
