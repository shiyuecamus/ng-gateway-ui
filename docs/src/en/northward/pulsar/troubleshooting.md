---
title: 'Pulsar Troubleshooting'
description: 'Pulsar common issues positioning: serviceUrl/port, token permission, TLS, topic/namespace, backlog and ack/nack behavior.'
---

## 1. Connection Failure

-   Does `serviceUrl` protocol and port match (`pulsar://6650` / `pulsar+ssl://6651`)
-   Does token have permission (tenant/namespace/topic)
-   TLS handshake failure (Certificate chain/hostname)

---

## 2. Connected but No Data

Prioritize checking:

-   Does AppSubscription exist
-   Is uplink mapping enabled
-   Are you consuming on the correct topic (Pulsar topic prefix is easy to write wrong)

---

## 3. Downlink Not Working

Check sequence:

1.  downlink enabled
2.  Is topic exact match (No template/No wildcard)
3.  Does AckPolicy/FailurePolicy cause ack/nack and retry behavior as expected
4.  Does MappedJson filter match

---

## 4. Backlog Increasing/Throughput Dropping

-   Can consumer keep up (Platform side backlog)
-   Need to enable batching (Throughput first)
-   Is `QueuePolicy` reasonable (Telemetry suggest Discard)
