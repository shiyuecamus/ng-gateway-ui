---
# https://vitepress.dev/reference/default-theme-home-page
layout: home
sidebar: false

hero:
  name: NG Gateway
  text: Next high-performance IoT gateway
  tagline: Runtime hot-swap expansion, stable high throughput
  image:
    src: https://i.postimg.cc/MTkKmT2b/image.png
    alt: NG Gateway
  actions:
    - theme: brand
      text: Get Started ->
      link: /en/guide/introduction/vben
    - theme: alt
      text: View on GitHub
      link: https://github.com/shiyuecamus/node-grove-gateway

features:
  - icon: ⚡️
    title: High-Performance Rust Core
    details: Built on tokio async runtime and backpressure-friendly pipelines for high-throughput edge workloads.
    link: /en/overview/architecture#rust-core
    linkText: Rust Core
  - icon: 🔌
    title: Southward Multi-Protocol
    details: A driver system for Modbus / S7 / IEC104 / DLT645 / CJT188 and more, with robust parsing and fault tolerance.
    link: /southward/overview
    linkText: Southward Docs
  - icon: 📡
    title: Northward MQTT v5
    details: Cloud-facing integration via MQTT v5, with message formats in both proto and JSON.
    link: /northward/mqtt-v5
    linkText: MQTT v5
  - icon: 🧩
    title: Plugin-First Extensibility
    details: Northbound connectors and enrichment capabilities evolve as plugins, configurable and enabled on demand.
    link: /en/dev/plugin-dev
    linkText: Plugin Dev
  - icon: 🛡️
    title: Security & Identity
    details: TLS, authentication and authorization baselines across device access and northward communication.
    link: /en/ops/tls
    linkText: TLS & Security
  - icon: 🔁
    title: Resilience by Design
    details: Timeouts, retries, backoff, bounded queues and graceful degradation to survive transient failures.
    link: /en/ops/troubleshooting
    linkText: Troubleshooting
  - icon: 📈
    title: Observability
    details: Structured tracing logs and metrics to pinpoint bottlenecks and anomalies quickly.
    link: /en/ops/metrics
    linkText: Metrics
  - icon: 🚢
    title: Deploy & Upgrade
    details: Docker/Helm deployment guidance with upgrade and rollback best practices.
    link: /en/ops/deploy-helm
    linkText: Deployment
  - icon: 🧱
    title: Developer-Friendly
    details: Clear extension points and unified data models for driver and plugin development, testing and maintenance.
    link: /en/dev/driver-dev
    linkText: Driver Dev
---

<VbenContributors />
