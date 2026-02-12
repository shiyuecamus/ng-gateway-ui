---
title: 'OPC UA NodeId: Syntax & How to Obtain'
description: 'Common forms of OPC UA NodeId (ns=;s=/i=/g=/b=), and how to browse and determine points from Servers like KEPServerEX/Prosys/Ignition.'
---

## What is NodeId

NodeId is the unique identifier for nodes (variables/objects/methods, etc.) in the OPC UA information model. NG Gateway's OPC UA Point/Action uses `nodeId` string to represent the node to read/write.

## Common NodeId Forms

Common spellings (Based on `opcua` crate parsing):

-   **String Identifier**: `ns=2;s=Channel1.Device1.Tag1`
-   **Numeric Identifier**: `ns=2;i=12345`
-   **GUID Identifier**: `ns=2;g=550e8400-e29b-41d4-a716-446655440000`
-   **ByteString Identifier**: `ns=2;b=...`

Where:

-   `ns`: namespace index
-   `s/i/g/b`: identifier type

## How to Get Correct NodeId (Suggested Workflow)

### 1) Confirm Endpoint & Security Policy First

In Server management interface or UA client tool (UAExpert, Prosys Client), confirm:

-   endpoint URL (Usually `opc.tcp://host:4840`)
-   Supported `SecurityPolicy` / `SecurityMode`
-   Whether username/password/certificate is needed

### 2) Browse Tree with UA Client Tool

Recommend:

-   UAExpert (Cross-platform)
-   Prosys OPC UA Browser (Cross-platform)

Find the target variable (Variable Node) in the Browse tree and view its NodeId.

### 3) Prefer "Stable Identifier"

Best Practice:

-   Try to use stable path form of `s=` (e.g., Tag Path of KEPServerEX), avoid `i=` drifting after restart/configuration change (Depends on Server implementation).

### 4) Verify DataType & Collection Mode

Confirm in UA Client for the variable:

-   UA DataType (Boolean/Int32/Double/String/DateTime/ByteString etc.)
-   Whether Subscription is allowed (MonitoredItem)
-   Whether Writing is allowed (AccessLevel)

These information directly determine:

-   How to choose Point's `data_type`
-   Whether Channel's `readMode` chooses Subscribe or Read

## Common Errors

-   **Wrong ns**: Same name node under different namespace will be different NodeId.
-   **Treating Method Node as Variable Node**: Method needs call, not read value; current driver mainly covers variable read/write.
-   **Array Node**: Current version does not support Array Variant; suggest splitting into multiple scalar nodes or providing scalar mapping on Server side.
