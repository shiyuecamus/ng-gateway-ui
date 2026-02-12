---
title: 'Kafka Downlink (commit/ack semantics)'
description: 'Kafka consumer subscribes to exact topic, decodes messages to NorthwardEvent; explains ack/commit semantics and impact of auto.offset.reset=latest.'
---

## 1. Supported Downlink Events

Kafka downlink supports mapping messages to:

-   WritePoint
-   CommandReceived
-   RpcResponseReceived

Downlink overview see: [`Downlink Overview`](/northward/downlink/overview)

---

## 2. Topic and Consumer Group

### 2.1 Exact Topic Restriction

Downlink `topic` must be **Exact String**, does not support:

-   <code v-pre>{{template}}</code>
-   `*` wildcard
-   `re:` / `regex:`

### 2.2 Consumer Group

Consumer group id is fixed as:

-   `ng-gateway-plugin-{app_id}`

And:

-   `enable.auto.commit=false` (Commit controlled by AckPolicy)
-   `auto.offset.reset=latest`

::: warning Meaning of `auto.offset.reset=latest`
When this consumer group has no offset, it will start consuming from **latest** (Will not backtrack history).
If you expect "Consume from earliest", current version does not provide this option (Needs separate handling on platform/ops side).
:::

---

## 3. AckPolicy / FailurePolicy

Kafka downlink "Confirmation" corresponds to commit:

-   `ack_policy=never`: Do not commit
-   `ack_policy=always`: Commit regardless of success/failure (Discard bad message)
-   `ack_policy=on_success`:
    -   Parse success or ignored by filter → commit
    -   Parse failure:
        -   `failure_policy=drop` → commit (Discard)
        -   `failure_policy=error` → do not commit (Wait for redelivery/fix)

---

## 4. Payload Selection

Recommend prioritizing EnvelopeJson (Stable, mixed topic routable):

-   [`Downlink EnvelopeJson`](/northward/downlink/envelope-json)

If platform side shape is inconsistent, then use MappedJson, and be sure to add filter in mixed topic scenarios:

-   [`Downlink MappedJson + Filter`](/northward/downlink/mapped-json)

---

## 5. Common Pitfalls

-   **Topic configured with template**: Will be rejected (Downlink must be exact topic)
-   **Same topic mixes multiple routes, but ack_policy inconsistent**: Will error when building routing table
-   **Headers non-UTF-8**: filter.mode=property cannot match (Will be ignored)
