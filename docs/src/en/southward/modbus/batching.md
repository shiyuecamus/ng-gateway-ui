---
title: 'Modbus Batch Read/Write Planning & Performance Tuning'
description: 'Interpret Modbus driver batch merging algorithm (Register/Bit separated: maxBatch*/maxGap*), and tuning suggestions for throughput and stability in RS-485/TCP scenarios.'
---

## Complete original planning

All readable fields in one Unit ID group are admitted before I/O. The planner sorts by original function/address, merges overlapping or adjacent ranges, and then segments the union into legal PDUs. Different address spaces remain separate. Aliases and nested fields share original reads; slices assemble every logical field completely before SDK conversion.

`maxGap*` counts unmapped addresses between exclusive ranges. Zero permits overlap and adjacency while forbidding holes. `maxBatchRegisters` must be within 1..125 and `maxBatchBits` within 1..2000; invalid limits are rejected. A permitted hole may still cause a remote illegal-address exception, so use zero for sparse device maps.

## Work and memory admission

`maxPlanningInputs` bounds original fields; `maxPlanningReferences` bounds PDU-to-field projections; `maxCollectionBytes` bounds complete native logical values. `maxPendingOperations` bounds active plus waiting work on the actual connection/bus; `maxPendingBytes` also bounds native plan/value reservations. Expired or cancelled queue waits cannot acquire send authority.

Numeric scalar layout uses fixed stack buffers. Variable fields use bounded owned assembly buffers. Byte/word ordering and exactly one SDK Transform occur after complete assembly. A failed PDU fails the logical collection; default buffer initialization never becomes an observed false/zero value.

## Connection lifetime

Each channel owns one native TCP connection or RTU bus. Whole logical groups serialize on that owner. TCP group scheduling can be concurrent, while actual wire requests remain single-flight. RTU waits t3.5 between qualified responses and the next request: 3.5 configured characters through 19200 baud, fixed 1.75 ms above that rate.

One absolute host deadline covers queue waits and every PDU. A per-PDU read timeout may shorten it. Every actual write/flush poll also checks the original deadline and caller/attempt cancellation. Active timeout, cancellation, malformed response or transport loss synchronously destroys the buffered context before reuse; no control is automatically replayed. A valid correlated exception leaves a clean connection reusable. Shutdown cancels queued/active callers and waits for native descriptor destruction.

Tune batch limits using the device map, response latency and actual serial transfer time. This software scheduling policy does not certify physical UART/RS-485 timing or electrical behavior.
