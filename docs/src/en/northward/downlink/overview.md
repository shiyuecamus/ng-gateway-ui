---
title: 'Downlink Overview (Platform → Gateway)'
description: 'Kafka/Pulsar and other plugins support receiving downlink messages from topics and mapping them to NorthwardEvent: WritePoint/Command/RpcResponseReceived.'
---

## 1. What Problem Does Downlink Solve

Downlink allows "Platform Side Requests" to enter the gateway and finally reach southward:

-   **WritePoint**: Write point
-   **CommandReceived**: Platform issues command
-   **RpcResponseReceived**: Platform returns RPC response

These downlink messages will be parsed by plugins into `NorthwardEvent`, then validated, serialized (by channel) and distributed to devices by core.

---

## 2. Topic Restriction: Exact Topic Only

Current downlink subscription strictly requires **exact topic**:

-   <code v-pre>{{template}}</code> NOT allowed
-   `*` wildcard NOT allowed
-   `re:`/`regex:` prefix NOT allowed

::: tip Why Design This Way
Downlink is control plane, must be **Predictable, Auditable, Rate Limitable**. Wildcard leads to uncontrolled fan-in (and even mis-delivery/attack).
:::

---

## 3. Payload Mode

Downlink supports two payloads:

-   **EnvelopeJson** (Recommended): Stable envelope + event.kind routing
-   **MappedJson**: Map arbitrary JSON to target event structure (With filter, avoiding mixed topic noise)

Entry:

-   [`Downlink EnvelopeJson`](/northward/downlink/envelope-json)
-   [`Downlink MappedJson + Filter`](/northward/downlink/mapped-json)

---

## 4. AckPolicy / FailurePolicy

Confirmation mechanisms differ across brokers (Kafka commit / Pulsar ack/nack), but northward uses two sets of policies uniformly:

### 4.1 AckPolicy

-   `on_success`: Confirm only when message "Is correctly parsed and successfully converted to event (or ignored by filter)"
-   `always`: Confirm regardless of parsing success/failure (Equivalent to drop-on-failure)
-   `never`: Never confirm (Debug usage; use with caution in production)

### 4.2 FailurePolicy (Only effective when `on_success` and failed)

-   `drop`: Confirm even if failed (Discard bad message, avoid poison message blocking)
-   `error`: Do not confirm if failed (Kafka no commit / Pulsar nack), used to request platform side to fix message and redeliver

::: warning Production Suggestion
Most production systems need "Sustainable Operation" more, so suggest:
-   Isolate control plane topic
-   Default `ack_policy=on_success` + `failure_policy=drop`
Only consider `failure_policy=error` when you can guarantee platform side "Redelivery Mechanism + Idempotent Processing".
:::
