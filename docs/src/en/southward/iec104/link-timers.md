---
title: 'IEC104 Link Timers/Windows & Backpressure Parameters'
description: 'Explain the meaning and tuning strategy of t0/t1/t2/t3/k/w, and how backpressure parameters like sendQueue/maxPendingAsduBytes protect the system.'
---

## 1) What are t0/t1/t2/t3

IEC104 has its own link confirmation and keep-alive mechanism on top of TCP, typical parameters are:

-   **t0**: Connection/Confirmation timeout (Establishment/Handshake phase)
-   **t1**: I-frame confirmation timeout (Wait for confirmation after sending I-frame)
-   **t2**: S-frame confirmation aggregation delay (Allow short-time aggregation confirmation, reduce ack frequency)
-   **t3**: Idle test frame period (Send test frame when link is idle for a long time)

**Tuning Suggestions**:

-   High network jitter on site: Appropriately increase t1/t0
-   Need to quickly detect disconnection: Appropriately decrease t3 (But will increase heartbeat overhead)

## 2) k/w Window and Throughput

-   **kWindow**: Max number of "Unconfirmed" I-frames allowed (Sliding window)
-   **wThreshold**: Trigger confirmation after receiving how many I-frames (Or trigger confirmation aggregation logic)

General Rule:

-   Larger kWindow allows more in-flight frames, higher throughput limit
-   But if the window is too large and the peer cannot handle it, backlog, timeout and retransmission risks will occur

Suggest starting with default values and observing:

-   Average response time, failure rate
-   Whether there is discard/backpressure caused by "Window Full"

## 3) Backpressure Parameters: Protecting Gateway and Field Devices

The driver includes a set of "Memory Budget/Queue Capacity" parameters to protect the system under abnormal conditions:

-   **sendQueueCapacity**: Send queue capacity (Avoid infinite accumulation)
-   **maxPendingAsduBytes**: Pending ASDU bytes limit (Prevent memory from being blown up by uplink flood)
-   **discardLowPriorityWhenWindowFull**: Discard low priority when window is full (Protect critical data)
-   **mergeLowPriority**: Merge low priority (Keep only the last value, reduce queue pressure)
-   **lowPrioFlushMaxAgeMs**: Allow low priority delayed flush (Reduce sending frequency caused by jitter)

::: tip Best Practice
-   "Critical Telesignaling/Telecontrol Feedback" priority should be high (Decided by protocol side), ensuring critical data is preserved as much as possible under backpressure strategy.
-   For high-frequency changing telemetry, recommend letting core use `report_type=Change` for change filtering, and avoid filling up the forwarding queue through merging/throttling on the southward side.
:::
