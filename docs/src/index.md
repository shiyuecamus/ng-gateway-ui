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
      link: https://github.com/shiyuecamus/node-grove-gateway

features:
  - icon: ⚡️
    title: Rust 高性能内核
    details: 基于 tokio 异步与背压设计，面向高吞吐数据采集与转发场景。
    link: /overview/architecture#rust-core
    linkText: Rust 内核
  - icon: 🔌
    title: 南向多协议接入
    details: 内置Modbus / S7 / IEC104 / DLT645 / CJT188 等驱动体系，面向南向设备读写、控制，强调容错与稳定性。
    link: /southward/overview
    linkText: 南向文档
  - icon: 📡
    title: 北向多应用接入
    details: 内置 Thingsboard / OPC UA Server / Kafka / MQTT 等插件体系，面向北向应用对接，强调容错与稳定性。
    link: /northward/overview
    linkText: 北向文档
  - icon: 🧩
    title: 插件化扩展
    details: 南向驱动、北向应用以插件形式演进，支持运行时热插拔、自定义开发、按需启用、独立配置、。
    link: /dev/plugin-dev
    linkText: 插件开发
  - icon: 🛡️
    title: 安全与认证
    details: TLS 证书、鉴权与权限控制，覆盖设备接入与北向通信的安全基线。
    link: /ops/tls
    linkText: TLS 与安全
  - icon: 🔁
    title: 稳健的容错机制
    details: 超时、重试、退避、队列背压与降级策略，避免瞬时故障拖垮网关。
    link: /ops/troubleshooting
    linkText: 故障排查
  - icon: 📈
    title: 可观测性
    details: tracing 日志与 Metrics 指标，帮助快速定位性能瓶颈与链路异常。
    link: /ops/metrics
    linkText: 运维观测
  - icon: 🚢
    title: 部署与升级
    details: 支持 宿主机/Docker/Helm 等部署形态，配套升级、回滚与配置管理建议。
    link: /install/helm
    linkText: helm部署指南
  - icon: 🧱
    title: 二次开发友好
    details: 统一的数据模型与扩展接口，驱动/插件二开路径清晰、可测试、可维护。
    link: /dev/driver-dev
    linkText: 驱动开发
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
