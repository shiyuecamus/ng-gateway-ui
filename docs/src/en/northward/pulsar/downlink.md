---
title: 'Pulsar Downlink'
description: 'Shared subscription consumes exact topic list; decode messages to NorthwardEvent; explain ack/nack and filter semantics.'
---

## 1. How Downlink Works

-   subscription name: `ng-gateway-plugin-{app_id}` (Stable naming, easy for broker to maintain state)
-   subscription type: Shared
-   topics: **Exact topic list** from route table

::: warning
Downlink topic does not support template/wildcard/regex.
:::

---

## 2. AckPolicy / FailurePolicy

Pulsar confirmation semantics:

-   `ack_policy=never`: No ack
-   `ack_policy=always`: Always ack (Bad messages will be discarded)
-   `ack_policy=on_success`:
    -   Successfully converted to event, or ignored by filter (Ok(None)) → ack
    -   Failure:
        -   `failure_policy=drop` → ack (Discard)
        -   `failure_policy=error` → nack (Wait for retry/redelivery)

See: [`Downlink Overview`](/northward/downlink/overview)

---

## 3. Payload Mode

-   Recommended: EnvelopeJson (`event.kind` routable, suitable for mixed topic)
-   Platform shape inconsistent: MappedJson + filter

Entry:

-   [`Downlink EnvelopeJson`](/northward/downlink/envelope-json)
-   [`Downlink MappedJson + Filter`](/northward/downlink/mapped-json)
