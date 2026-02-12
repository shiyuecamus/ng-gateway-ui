---
title: 'Product Overview'
description: 'NG Gateway Product Overview: Core Positioning, Key Advantages, Core Concepts, and Quick Navigation.'
---

# Product Overview

NG Gateway is a high-performance IoT gateway designed for **Industrial/Edge scenarios**. Built on the Rust + tokio runtime, it uses a **backpressure-friendly data pipeline** to standardize southward multi-protocol acquisition data and reliably forward it to platforms via northward plugins, while providing runtime pluggable extension capabilities.

## Key Advantages

**End-to-End System Design: Why It Runs Fast and Stably (Backpressure-first)**:

-   **Bounded Queues + Backpressure Propagation**: The system automatically "slows down" when downstream slows, avoiding OOM caused by unbounded accumulation.
-   **Fault Isolation**: Tasks are isolated by device/channel/plugin granularity, preventing single-point anomalies from spreading.
-   **Structured Concurrency**: `stop`/`reload` have clean cancellation paths and resource reclamation capabilities.
-   **Built-in Observability**: Queue depth, retry/backoff, latency, and drops can be measured and alerted, not operated by "feeling".
-   **Unified Model & Composable Pipeline**: Changes in protocols/platforms/rules are confined within clear boundaries, keeping core evolution costs controllable.

**Rich Built-in Southward Drivers & Northward Plugins (Out-of-the-Box)**:

-   **Southward Driver System** covers Modbus / OPCUA / S7 / DNP3 / Ethernet-IP / IEC104 / DLT645 / CJT188 and other protocols (Built-in + Extensible).
-   **Northward Plugin System** covers MQTT / Kafka / Pulsar / ThingsBoard and other platform integrations (Enable on demand, isolating risks and changes).
-   **Engineering Delivery**: Plugins/Drivers possess meta-information probing (probe), dynamic schema scanning (Excel import templates & UI rendering), and version & platform information verification, facilitating governance and operations.

**Southward Acquisition "Batch Processing Algorithm" (Field-Friendly, Performance-Friendly)**:

-   **Batch Read/Write & Split Strategy**: For protocols like Modbus / S7 with frame length/PDU/latency constraints, it automatically groups and splits packets by point collections, significantly reducing round-trip and system call overhead.
-   **Exception-Oriented Scheduling**: Scenarios like device busy, timeout, noise frames, and transient disconnections are recoverable, and jitter is confined locally through backoff/rate limiting.
-   **Resource Control**: Hot paths avoid frequent allocation, prioritizing best practices like pre-allocation, reuse, and zero-copy parsing.

**Large-Scale Concurrency & Resource Control (Production-Oriented)**:

-   **Massive Device Concurrency Model**: Tasks are organized by device/channel granularity, combined with bounded queues to implement backpressure propagation, avoiding "slow platforms dragging down the whole system".
-   **Fault Domain Isolation**: Failures are confined within device/channel/application (App)/plugin boundaries, avoiding cascading avalanches.
-   **Controllable Degradation Path**: When downstream is unavailable or congested, prioritize "slow down/drop/cache/receipt failure" and other explainable strategies instead of silent accumulation.

**Convenient Deployment & Multi-Architecture Adaptation (Low-Cost Landing)**:

-   **Low Resource Footprint**: Rust native binaries are more conducive to low-memory edge environments (Container/Bare Metal).
-   **Multi-Architecture Delivery**: Adapted for common architectures like x86_64 / aarch64, with plugins/drivers delivered separately by platform.
-   **Diverse Deployment Methods**: Single machine, Docker, Helm, offline packages, etc., satisfying the delivery path from pilot to scale.

**Runtime Pluggable Extension (Web-UI / HTTP API Multi-Entry)**:

-   **Hot Plug Install/Uninstall**: Supports uploading and installing southward drivers and northward plugins via HTTP API (and Web-UI visual entry).
-   **Clear Governance Constraints**: When a driver is still referenced by a southward channel, or a plugin is still referenced by a northward application (App), the system prevents uninstallation to avoid operation interruption and configuration drift.
-   **Extensions Do Not Pollute Core**: High-change capabilities (platform adaptation, industry rules, enhanced processing) are prioritized to settle on the plugin side, keeping the core with stable abstractions and high-throughput paths.

**Authentication & Security (Default Security Baseline)**:

-   **Encrypted Transmission**: API services support TLS/HTTPS encrypted links, reducing the risk of plaintext transmission on the edge side.
-   **Authentication & Authorization**: Supports JWT authentication and RBAC/permission rules, meeting multi-role operation and audit requirements.
-   **Supply Chain Governance**: Plugins/drivers have detection and verification information (version/platform/checksum, etc.), facilitating release, rollback, and auditing.

**Unified Data Model & Data Types (Making "Integration" Reusable)**:

-   **Unified Semantics**: Confine "protocol differences" within the driver, and unify semantics such as device/point/value/timestamp/quality into a unified model.
-   **Multi-Payload Strategy**: Northward supports JSON/Proto/Raw (Passthrough) and other payload strategies, balancing debugging efficiency and throughput performance.

**One-Click Entry to More Vertical Scenarios (Change Plugins Only, Not Core)**:

-   **Upper-Layer Applications & Industry Systems**: MES / ERP / SCADA / Energy Consumption / Production Line Dashboards, etc.
-   **Data Processing & Storage**: Big Data Platforms, Time-Series Databases, Lakehouses, Alarm & Work Order Systems.
-   **AI Analysis & Edge Intelligence**: Edge-side preprocessing/aggregation/filtering, closed-loop access for cloud-side AI inference/anomaly detection.

---

## Core Concepts

<a id="glossary"></a>

### Terminology & Boundaries

-   **gateway core**: High-throughput asynchronous pipeline and resource governance center, providing backpressure, rate limiting, retry/backoff, observation, and lifecycle management.
-   **southward (Southward System)**: The access boundary for field devices (driver + channel + collector, etc.), responsible for connection, read/write, parsing, fault tolerance, and mapping protocol semantics to the unified data model.
-   **driver**: A capability package for a protocol or device family, responsible for connection, read/write, parsing, and fault tolerance; mapping protocol semantics to the unified model.
-   **channel**: Connection and resource boundary on the southward side, usually corresponding to a serial port, a TCP connection, or a shared session (usually it is an instantiation of a southward driver).
-   **device**: A real object existing in the field (meter, PLC, sensor...), possessing a unique identifier, connection information, point collection, and running status.
-   **point (Data Point)**: A readable/writable "variable" (register/object/node) on the device. A point is one of the smallest granularities of the unified data model.
-   **collector**: The runtime collection execution unit, turning collection strategies (periodic/batch/subscription) into predictable scheduling behaviors.
-   **northward (Northward System)**: A collection of platform connectors (MQTT/Kafka/Pulsar/ThingsBoard, etc.), responsible for reliable delivery and uplink/downlink closed loops.
-   **plugin**: A runtime pluggable extension unit, usually carrying northward platform integration and conversion/enhancement capabilities on the unified model; plugins should have clear resource boundaries and recyclability.
-   **app (Application)**: The "business orchestration unit" on the northward side, used to associate southward data streams with northward plugin/routing strategies (usually it is an instantiation of a northward plugin).

::: tip Mnemonic
southward/northward are "boundary planes", core is the "transport hub".
:::

<a id="data-model"></a>

### Unified Data Model: Why It Is the "Heart of the Gateway"

Real-world protocols vary widely: Modbus uses registers, S7 uses DB/variables, OPC UA uses NodeId, IEC104 uses telemetry/telesignaling... If every protocol defined its own reporting structure, northward integration would quickly spin out of control.

The goals of the unified data model are:

-   **Let Northward Only Care About "Business Semantics"**: Device, point, value, timestamp, quality, event, action, control.
-   **Make Rules/Transformations Reusable**: The same rule can apply to similar points of Modbus/S7/OPC UA.
-   **Make Observability Aggregatable**: Throughput, latency, and error rates can be statistically analyzed by device/driver/channel/app dimensions.

::: tip
It is recommended to store "Protocol Address/Register Number/NodeId" as `meta` (if necessary), and do not let it pollute northward business fields.
:::

<a id="pipeline"></a>

### core pipeline: The Data Flow That Connects Everything

A typical data flow (uplink) is:

1.  collector triggers collection (or subscription callback triggers)
2.  driver executes read/write and parsing
3.  produces unified event/point value
4.  core performs optional transformation/filtering/aggregation (edge computing)
5.  northward encodes and sends
6.  observability records logs and metrics

The corresponding downlink (control) flows in reverse:

1.  northward receives platform command
2.  core validates/authenticates/rate-limits
3.  southward finds target device/driver
4.  driver executes write/control
5.  returns execution result and receipt (optional)

<a id="lifecycle"></a>

### Lifecycle: Start, Run, Stop (Graceful Exit)

In an edge gateway, "Graceful Exit" is not icing on the cake, but a rigid demand to avoid field accidents:

-   **Start**: Load configuration → Initialize logs/metrics → Load drivers/plugins → Create device tasks → Establish northward connections
-   **Run**: Collection/Reporting loop + Health check (Optional: Hot update/Hot plug)
-   **Stop**: Stop collection scheduling → Cancel in-flight tasks (with timeout) → Close connections/serial ports → Flush buffers (optional) → Exit

::: tip Best Practice
Whether `stop` or `reload`, there must be an "upper limit time".
:::