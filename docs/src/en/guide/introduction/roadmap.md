---
title: Roadmap
description: Roadmap
---

# Roadmap

We will continuously polish NG Gateway into a **Stable, Reliable, Operable, Extensible** industrial-grade IoT gateway product.

---

## Milestone M0: Stable for Launch

-   **Reliable Operation and Performance Baseline**
    -   Stability: Stable operation and automatic recovery under weak network/jitter/high load scenarios
    -   Performance: Establish official stress test baseline (Point Scale × Period × Latency), and continuously optimize throughput/latency
-   **Observability and Troubleshooting (Better Usability)**
    -   Metrics and Dashboard perfection (Southward Channel / Northward App / Backpressure Queue / Resource)
    -   Troubleshooting Toolbox: Connection Test, Write Point/Action Debug, Temporary Log Level (Auto Rollback) etc.
-   **Configuration and Change Governance**
    -   Configuration Change Audit (Who changed what, when, impact scope)
    -   Configuration Snapshot and Rollback (Reduce field change risk)

---

## Milestone M1: Weak Network Reliable Delivery + Controllable Degradation

-   **Offline Resume (WAL + Replay)**
    -   Try to guarantee critical data integrity delivery under weak network/disconnect/power loss scenarios
    -   Support disk buffer, quota and cleanup strategy, replay rate limiting and realtime link isolation
-   **Queue Full Intelligent Degradation (Unified Strategy)**
    -   Degrade in a controllable way when downstream congested, prioritize protecting gateway stability and critical business
    -   Support strategies like TTL, Sampling, Merge by Last, Priority Retention (Alarm/Control first)

---

## Milestone M2: North/South Ecosystem Extension + Productization Governance

### Southward Ecosystem (Southward Drivers)

-   **Enhance Existing Drivers (Supported, but will continuously optimize)**
    -   Modbus RTU/TCP: Batch collection planning, performance optimization, diagnostic capability enhancement
    -   Siemens S7: More models/more data types, fault tolerance and field troubleshooting enhancement
    -   IEC 60870-5-104: Stronger fault tolerance, event/telecontrol scenario enhancement
    -   DL/T 645 (1997/2007): More meter and exception scenario coverage
    -   OPC UA Client: Subscription/Collection strategy, stability and diagnosis enhancement
    -   Serial (RS-232/485), TCP/UDP: Connection governance, timeout and retry strategy optimization
-   **New Southward Drivers (Planned extension, push by demand priority)**
    -   Industrial Automation/PLC: EtherNet/IP (CIP), Mitsubishi MC, Omron FINS, Profinet (Evaluation)
    -   Power/Energy: IEC 61850 (MMS/Report; GOOSE Evaluation), DNP3
    -   Building/Meter/Bus: BACnet, M-Bus / wM-Bus, CAN / CANopen
-   **General Capability Continuous Enhancement**: Unified Timeout/Retry/Backoff, Batch Planning, Concurrency Capability, Field Diagnostic Toolchain

### Northward Ecosystem (Northward Plugins)

-   **Enhance Existing Plugins (Supported, but will continuously optimize)**
    -   ThingsBoard: Connection stability, uplink/downlink capability, diagnostic experience continuous enhancement
    -   Kafka / Pulsar: Batch/Compression, Backpressure and Retry strategy, Throughput and Latency optimization
    -   OPC UA Server: Data model mapping, write link and observability enhancement
-   **New Northward Plugins (Planned extension, push by demand priority)**
    -   IoT Platform/Cloud Vendor: AWS IoT Core, Azure IoT Hub, Aliyun IoT / Tencent Cloud IoT / Huawei Cloud IoTDA (On demand)
    -   Messaging and Streaming: MQTT v5, NATS / JetStream, RabbitMQ (AMQP), Redis Streams
    -   Data Storage/Analytical Destination: InfluxDB, TimescaleDB / PostgreSQL, ClickHouse, Elasticsearch / OpenSearch, S3 / MinIO (By scenario)
-   **Higher Throughput Encoding and Transmission**
    -   Binary payload (Protobuf/Avro etc.) to reduce bandwidth and CPU (Applicable to high frequency/large scale points)
    -   Richer mapping and protocol adaptation capabilities (Improve flexibility without sacrificing performance)

### Productization Governance

-   **Plugin/Driver Governance**
    -   Compatibility and Upgrade Strategy (Version constraint clear, upgrade predictable)
    -   Gray Release and Rollback (Quick rollback on issue)
    -   Signature and Source Verification (Supply Chain Security)
-   **Security Enhancement**
    -   Management Plane Security Baseline Continuous Hardening (Permission, Audit, Sensitive Information Protection)
    -   TLS/mTLS Capability Enhancement (Step-by-step coverage by scenario)

---

## Iteration Direction We Long Adhere To

-   **Performance First**: High throughput, low latency, low resource footprint
-   **Stability First**: Weak network tolerance, recoverable, explainable
-   **Operability First**: Metrics/Logs/Diagnostics closed loop, reduce field cost
-   **Ecosystem First**: Long-term extension and engineering delivery of Southward Drivers + Northward Plugins
