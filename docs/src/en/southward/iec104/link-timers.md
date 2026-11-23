---
title: 'IEC104 link timers, windows and outbound backpressure'
description: 'TCP establishment, I/U link confirmation, k/w windows, outbound budgets and independent application deadlines.'
---

## 1. Timers and confirmation layers

The host field allows IPv4, IPv6 (including brackets/zone), and ASCII hostnames with an optional final root dot, under a 254-byte presentation bound. Form prefiltering does not replace exact server address validation.

| Field | Default | Responsibility |
| --- | --- | --- |
| `t0Ms` | `10000` | One endpoint deadline for resolution and every TCP candidate |
| `t1Ms` | `15000` | Oldest unacknowledged completed I-frame and U confirmations such as STARTDT/STOPDT/TESTFR |
| `t2Ms` | `10000` | S-ACK aggregation deadline after unacknowledged peer I-frames |
| `t3Ms` | `20000` | Initiate TESTFR when idle |

`t0Ms` is not a complete application-handshake deadline. U confirmations after TCP establishment use t1. S/I link ACKs do not replace GI/CI or control ACT_CON/ACT_TERM.

Application requests retain their own original deadline. Queueing, link acknowledgment, selection confirmation and reconnection do not extend it. A healthy link without application confirmation can still leave an unknown result.

## 2. k/w and sequences

- `kWindow` defaults to `12`: the number of actually completed local I-frame writes still awaiting valid peer acknowledgment, in `1..32767`.
- `wThreshold` defaults to `8`: acknowledge after this many peer I-frames or t2, in `1..kWindow`.
- Timers must be nonzero and `t2Ms < t1Ms`; invalid combinations are denied.
- Fifteen-bit sequences wrap as specified. Invalid/ahead ACKs do not release incomplete transmissions, and expiry does not manufacture acknowledgment.

A larger k allows more in-flight work and retained ownership. Select it from the device profile, observed round-trip time, failures and occupancy. Enlarging it does not resolve missing confirmations. Link loss does not automatically resend an entire original control operation.

## 3. Outbound queues and bytes

| Field | Default | Meaning |
| --- | --- | --- |
| `sendQueueCapacity` | `1024` | Bounded outbound request queue; control/interrogation also reserve native work and targets |
| `maxPendingAsduBytes` | `1048576` | Pending/in-flight outbound ASDU byte constraint, also used by separate control/interrogation work reservations |
| `discardLowPriorityWhenWindowFull` | `true` | Drop low-priority outbound requests when full |
| `mergeLowPriority` | `true` | When that drop policy is disabled, retain the last low-priority outbound request |
| `lowPrioFlushMaxAgeMs` | `2000` | Flush age for a merged low-priority request; `0` disables the age trigger |
| `tcpNodelay` | `true` | TCP_NODELAY |

Queue capacity must be at least `1`, and pending-byte capacity must be at least the native `12`-byte I-frame envelope. Neither may exceed the limits published in the current build's metadata. Oversized configurations are rejected before commit, preserving the previous revision and connection. A maximum value does not mean that amount of memory is allocated or reserved. A legal but low capacity can still cause a particular request to be refused for lack of credit; that differs from an invalid oversized configuration.

Low-priority policies concern outbound requests, not a promise to merge or preserve inbound telemetry. High-priority control cannot be dropped/merged and reported completed. Queue/budget refusal differs from an unknown outcome after sending.

A repeated setting name is not a single process-wide memory ceiling. Inbound ASDUs, Core samples/cache, northward queues and infrastructure have separate boundaries and observations. This setting is not a total uplink-flood memory limit, and RSS does not replace business-data ownership accounting.

## 4. Observe before tuning

Observe association state, link ACK, application acceptance/termination, independent acquisition quality, inbound loss diagnostics and queue/byte refusals separately. Interrogation completion does not guarantee admission of every sample into Core. `dataSilenceTimeoutSecs` tracks process-information activity; link keep-alive does not prove process data is updating.

Use the actual device profile and observations when adjusting timers/windows, while preserving original operation identity. Extending an original deadline, reconnecting or creating a new intent to resend does not establish successful recovery from an unknown outcome.
