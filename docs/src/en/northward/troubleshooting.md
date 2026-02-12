---
title: 'Northward Troubleshooting Index'
description: 'Quick positioning by symptoms: No data, wrong topic, queue full, auth failure, downlink not working, OPC UA node not visible, etc.'
---

## 1. General Troubleshooting Principles (Do these three steps first)

1.  **Confirm Subscription**: Is `AppSubscription` created? (No subscription = Definitely no data)
2.  **Confirm Connection**: Is App connection status Connected/Failed? (Fix connection first if Failed)
3.  **Confirm Topic & Payload**: Is topic rendered correctly? Does payload meet consumption side expectation?

---

## 2. Common Symptoms → Quick Positioning

### 2.1 App shows Connected, but no data on platform side

-   Is corresponding uplink mapping enabled (e.g., telemetry.enabled)?
-   Is topic rendered as empty (Template variable missing)?
-   Is platform side consuming on the correct topic?
-   Does `QueuePolicy.dropPolicy=Discard` cause massive drops (Under high load)?

### 2.2 App shows Failed (Auth/Network/TLS)

-   Kafka: bootstrap servers, SASL/TLS config, ACL
-   Pulsar: service_url, token, tenant/namespace permission
-   ThingsBoard: token/username/password, certificate path, Provision key/secret
-   OPC UA Server: Port conflict, Certificate/PKI, client trust

### 2.3 Queue Full (QueueFull / outbound queue rejected)

-   Main queue `capacity` too small
-   Platform side consumption slow (lag/backlog)
-   Topic too fine-grained causing partition hotspot
-   Mixed high-frequency telemetry and critical control

### 2.4 Downlink message sent but gateway did not execute

-   downlink topic must be exact match (No template)
-   Does `AckPolicy/FailurePolicy` cause message to be drop/ignore?
-   When using MappedJson, does filter match?
-   Is payload shape correct (event.kind and data fields)?
