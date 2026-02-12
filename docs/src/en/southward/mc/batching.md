---
title: 'MC Batch Read/Write & Performance Tuning'
description: 'Explain meaning of maxPointsPerBatch/maxBytesPerFrame/concurrentRequests, how to set batch limits by PLC series, and common performance/stability trade-offs.'
---

## 1) Why Batching

MC protocol supports batch read/write. For a large number of points, if requested point by point:

-   Many round trips, low throughput
-   High scheduling overhead and network overhead

The driver uses a planner in collection and write paths to merge multiple points into fewer batch requests.

## 2) `maxPointsPerBatch`

Meaning: **Upper limit of logical points allowed to be merged in one batch** (Actual meaning for word/bit is decided by protocol layer planning).

Suggestion:

-   Keep default if unsure (Usually consistent with typical limit of the series)
-   Can be increased when there are very many points, but do not exceed maximum value allowed by PLC/Protocol

## 3) `maxBytesPerFrame`

Meaning: **Single frame payload byte limit**, used to avoid constructing overly large request/response causing failure or affecting latency.

Suggestion:

-   Default 4096 is usually a reasonable starting point
-   Appropriately decrease if network quality is average or device processing is slow

## 4) `concurrentRequests`

Meaning: Number of concurrent in-flight requests allowed on the same connection.

Driver default is 1 (Strongest determinism), increasing concurrency may improve throughput, but risks include:

-   Device/Gateway does not support concurrency leading to out-of-order response or error
-   Increase instantaneous load and packet loss probability

Suggestion:

-   Run stable with 1 first, then gradually increase in stress test environment (e.g., 2→4), observe error rate and average response time.

## 5) Relationship with PLC Series

Different `series` have different batch limits (Driver has built-in maximum values corresponding to series), therefore:

-   Series must be correct, otherwise you might configure batch parameters that "seem usable but actually exceed limit"
