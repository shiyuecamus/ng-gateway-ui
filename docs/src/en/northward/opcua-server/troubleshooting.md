---
title: 'OPC UA Server Troubleshooting'
description: 'Common issues positioning: Cannot connect, Node invisible, Value not updating, Writeback failure, Certificate untrusted, Port/Endpoint selection error.'
---

## 1. Cannot Connect

-   Is address correct: `opc.tcp://<host>:4840/`
-   Is port occupied
-   Is container port exposed
-   Did client select correct endpoint (no_security vs secure)

---

## 2. Cannot See Any Nodes

Prioritize checking:

-   Is AppSubscription created (No subscription = No points routed)
-   Is there Telemetry/Attributes data entering this App

::: tip
Nodes are created lazily: Only "Points routed to this App" will appear.
:::

---

## 3. Value Not Updating / Subscription No Change

-   Is update queue dropping (Under high system pressure)
-   Did you subscribe to correct variable node
-   Is point meta missing causing node not created (Usually created after receiving data)

---

## 4. Writeback Failure (BadTypeMismatch/BadNotWritable/BadNotConnected)

Common causes:

-   Point access_mode is not Write/ReadWrite
-   Client write Variant type mismatch (Current strict type)
-   Device/Channel not connected
-   Write timeout (writeTimeoutMs or southward write timeout)

See: [`Writeback Link & StatusCode Mapping`](/northward/opcua-server/writeback)
