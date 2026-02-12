---
# https://vitepress.dev/reference/default-theme-home-page
layout: home
sidebar: false

hero:
  name: NG Gateway
  text: 新一代高性能 IoT 网关
  tagline: 运行时热插拔扩展，稳定高吞吐
  image:
    src: https://i.postimg.cc/MTkKmT2b/image.png
    alt: NG Gateway
  actions:
    - theme: brand
      text: 快速开始 ->
      link: /install
    - theme: alt
      text: 在 GitHub 查看
      link: https://github.com/shiyuecamus/ng-gateway

features:
  - icon: ⚡️
    title: Rust 异步高性能内核
    details: 基于 tokio 的结构化并发与资源隔离，在高并发采集/转发场景保持吞吐稳定且可预测。
    link: /overview/architecture#rust-core
    linkText: 架构概览
  - icon: 🌊
    title: 可控背压与失败语义
    details: 全链路有界队列 + 明确失败策略（超时/重试/退避/丢弃/阻塞），避免“慢”演化为 OOM 与雪崩（WAL 续传在 Roadmap）。
    link: /overview/architecture#failure-semantics
    linkText: 失败语义
  - icon: 🧠
    title: 协议批量算法
    details: Modbus / S7 等内置批处理读写计划，尽可能把“逐点轮询”压缩为少量请求，显著降低 RTT 与设备压力。
    link: /southward/modbus/batching
    linkText: 批量规划与调优
  - icon: 🔌
    title: 南向多协议驱动生态
    details: 运行时可插拔南向驱动；内置支持 Modbus / S7 / IEC104 / OPC UA / EtherNet/IP 等。
    link: /southward/overview
    linkText: 南向总览
  - icon: ☁️
    title: 北向插件与双向链路
    details: 运行时可插拔北向插件；内置支持 ThingsBoard / Kafka / Pulsar / OPC UA Server 等。
    link: /northward/overview
    linkText: 北向总览
  - icon: 🧬
    title: UI 自动建模与批量导入
    details: Driver Metadata Schema 自动渲染表单并生成 Excel 模板，支撑大规模设备/点位的快速建模与一致校验。
    link: /southward/driver-metadata-schema
    linkText: Schema 与 Excel
  - icon: 🛠️
    title: 运维调参与日志治理
    details: 支持运行时调参（Collector/Southward/Northward）与 per-channel/app 日志级别 TTL 覆盖，排障可控、成本可控。
    link: /ops/configuration
    linkText: 配置管理
  - icon: 📈
    title: 可观测性闭环
    details: Prometheus `/metrics` + UI WS 聚合指标 + 设备实时快照，配套标准化排障 SOP，快速定位“采集/路由/上报”瓶颈。
    link: /ops/observability
    linkText: 可观测性
  - icon: 🚢
    title: All-in-one 部署与升级
    details: 单服务同时提供 Web UI（/）与 API（/api）；支持 Docker/Helm 部署与持久化数据卷，升级路径清晰。
    link: /install/docker
    linkText: Docker 快速开始
---

<!-- <script setup>
import {
  VPTeamPage,
  VPTeamPageTitle,
  VPTeamMembers,
  VPTeamPageSection
} from 'vitepress/theme';

const members = [
  {
    avatar: 'https://avatars.githubusercontent.com/u/28132598?v=4',
    name: 'Vben',
    title: '创建者',
    desc: 'Vben Admin以及相关生态的作者，负责项目的整体开发。',
    links: [
      { icon: 'github', link: 'https://github.com/anncwb' },
    ]
  },
]
</script>

<VPTeamPage>
  <VPTeamPageTitle>
    <template #title>
      核心成员介绍
    </template>
  </VPTeamPageTitle>
  <VPTeamMembers
    :members="members"
  />
</VPTeamPage> -->

<!-- <VbenContributors /> -->
