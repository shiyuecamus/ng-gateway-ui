---
title: 'Kafka Troubleshooting'
description: 'Kafka plugin common issues positioning: Connection failure, ACL, TLS/SASL, topic rendering exception, queue full, consumer group offset and downlink not working.'
---

## 1. Connection Failure

### 1.1 Broker Unreachable

-   Check `bootstrapServers`
-   Container network (DNS, Port Mapping)
-   Broker listener configuration (advertised.listeners)

### 1.2 ACL/Auth Failure

-   Mechanism match (PLAIN/SCRAM)
-   User produce/consume permission on topic
-   TLS CA correctness, hostname verification enabled

See: [`Kafka Connection & Security`](/northward/kafka/connection-security)

---

## 2. Connected but No Data

Prioritize confirming:

-   Is AppSubscription created
-   Are `uplink.enabled` and `uplink.telemetry.enabled` turned on
-   Is topic rendered as empty (Template variable missing)

---

## 3. Queue Full

Meaning:

-   The plugin has an internal bounded outbound queue (to move I/O out of hot path), which may reject sending when Kafka I/O or delivery receipt piles up.

Suggestion:

-   Prioritize checking platform side consumption and broker load (Congestion/Throttling)
-   Split App (Separate telemetry and control plane)
-   Adjust producer batch/linger (Reduce sending pressure or improve throughput)

---

## 4. Downlink Not Working

Check sequence:

1.  Is downlink `enabled`
2.  Is topic exact match (No template/No wildcard)
3.  Is payload correct EnvelopeJson/MappedJson
4.  Is `ackPolicy/failurePolicy` as expected (Dropped/Ignored)
