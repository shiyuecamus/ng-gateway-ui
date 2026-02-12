---
# https://vitepress.dev/reference/default-theme-home-page
layout: home
sidebar: false

hero:
  name: NG Gateway
  text: Next-generation high-performance IoT gateway
  tagline: Runtime hot-plug extensions, stable high throughput
  image:
    src: https://i.postimg.cc/MTkKmT2b/image.png
    alt: NG Gateway
  actions:
    - theme: brand
      text: Get Started ->
      link: /en/install/
    - theme: alt
      text: View on GitHub
      link: https://github.com/shiyuecamus/ng-gateway

features:
  - icon: ⚡️
    title: Async Rust high-performance core
    details: Built on tokio with structured concurrency and resource isolation, keeping throughput stable and predictable under heavy collection/forwarding workloads.
    link: /en/overview/architecture#rust-core
    linkText: Architecture
  - icon: 🌊
    title: Controlled backpressure & failure semantics
    details: Bounded queues end-to-end + explicit failure strategies (timeout/retry/backoff/drop/block), preventing “slow” from turning into OOM and cascades (WAL replay is on the roadmap).
    link: /en/overview/architecture#failure-semantics
    linkText: Failure semantics
  - icon: 🧠
    title: Protocol batching algorithms
    details: Built-in batch planning for Modbus / S7 and more, compressing point-by-point polling into a small number of requests to reduce RTT and device pressure.
    link: /en/southward/modbus/batching
    linkText: Batch planning & tuning
  - icon: 🔌
    title: Southward multi-protocol driver ecosystem
    details: Hot-pluggable southward drivers at runtime, with built-in support for Modbus / S7 / IEC104 / OPC UA / EtherNet/IP and more.
    link: /en/southward/overview
    linkText: Southward overview
  - icon: ☁️
    title: Northward plugins & bidirectional links
    details: Hot-pluggable northward plugins at runtime, with built-in integrations for ThingsBoard / Kafka / Pulsar / OPC UA Server and more.
    link: /en/northward/overview
    linkText: Northward overview
  - icon: 🧬
    title: UI auto-modeling & bulk import
    details: Driver Metadata Schema renders forms and generates Excel templates automatically, enabling fast, consistent modeling for large-scale devices and points.
    link: /en/southward/driver-metadata-schema
    linkText: Schema & Excel
  - icon: 🛠️
    title: Ops tuning & log governance
    details: Runtime tuning (Collector/Southward/Northward) and per-channel/app log-level overrides with TTL—troubleshooting stays controlled and cost-effective.
    link: /en/ops/configuration
    linkText: Configuration
  - icon: 📈
    title: Observability loop
    details: Prometheus `/metrics` + UI WS aggregated metrics + real-time device snapshots, with standard troubleshooting SOP to pinpoint “collection/routing/uplink” bottlenecks.
    link: /en/ops/observability
    linkText: Observability
  - icon: 🚢
    title: All-in-one deployment & upgrades
    details: A single service provides both Web UI (`/`) and API (`/api`), supports Docker/Helm deployments with persistent volumes, and offers a clear upgrade path.
    link: /en/install/docker
    linkText: Docker quick start
---

<!-- Contributors widget is intentionally disabled for product docs. -->
