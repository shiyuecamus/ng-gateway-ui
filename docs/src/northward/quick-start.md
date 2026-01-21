---
title: '北向快速开始'
description: '从 0 到 1 跑通北向：创建 App、配置连接与 payload、订阅设备、验证上行与（可选）下行。'
---

## 你将得到什么

完成本文档后，你将能：

- **创建一个北向 App**（Kafka/Pulsar/ThingsBoard/OPC UA Server）
- **把设备数据上送到北向平台**（Telemetry / Attributes / 设备上下线事件）
- **验证链路是否工作**：连接状态、Topic、消息形状、消费/订阅是否正常
- （可选）**跑通下行链路**：WritePoint / Command / RPC Response（取决于插件）

::: tip 先选一个目标平台
- 想接入“消息总线/数据湖”：优先选择 **Kafka / Pulsar**
- 想接入“物联网平台/设备管理”：选择 **ThingsBoard**
- 想把网关数据“对外暴露成标准工业协议”：选择 **OPC UA Server**
:::

---

## 0. 前置条件

- 网关已安装并可访问 UI（或 API）
- 至少有一个南向 Channel/Device 正常采集（在实时监控能看到数据）
- 目标北向平台已就绪（Kafka broker / Pulsar broker / ThingsBoard / OPC UA client 工具）

::: warning 当前版本限制（务必先读）
- **无磁盘断网续传**：仅有 `QueuePolicy.bufferEnabled` 的**内存缓冲**，重启/掉电会丢失缓冲数据。
- **满队列策略较粗**：目前主要通过 `QueuePolicy.dropPolicy`（Discard/Block）实现背压保护。
- **ThingsBoard Protobuf**：配置存在但当前版本未实现（会报错）。
更多计划能力见路线图：[`路线图`](/guide/introduction/roadmap)
:::

---

## 1. 创建北向 App（插件实例）

1. 打开 **北向** → 选择目标插件（Kafka/Pulsar/ThingsBoard/OPC UA Server）
2. 点击 **新建 App**
3. 填写：
   - **name**：建议使用可运维命名（如 `prod-kafka-telemetry`）
   - **description**：建议写清楚用途（遥测/告警/控制）
   - **config**：插件私有配置（连接、topic、payload 等）
   - **retryPolicy / queuePolicy**：通用策略（推荐先用默认，然后按吞吐/稳定性调优）

<!-- TODO screenshot: northward-app-create -->

::: tip 建议：按数据类型拆分多个 App
不要把“关键控制/告警”和“高频遥测”塞进同一个 App。
- 关键链路：更大的队列、更长重试窗口，必要时 `dropPolicy=Block`
- 高频遥测：优先 `dropPolicy=Discard`，保护网关稳定性
:::

---

## 2. 创建 AppSubscription（订阅设备数据）

北向 App 默认不会收到任何数据，你必须创建订阅来告诉路由器：哪些设备/哪些数据要扇出给该 App。

1. 打开该 App 详情页 → **订阅**
2. 选择设备（或按规则批量选择）
3. 设置优先级 `priority`（资源紧张时先保证高优先级订阅）

<!-- TODO screenshot: northward-app-subscription -->

---

## 3. 验证“上行”是否工作（推荐顺序）

### 3.1 看连接状态

进入 App 页面，观察连接状态：

- **Connected**：表示插件 supervisor 已建立连接（Kafka producer / Pulsar producer / MQTT client / OPC UA server 已启动）
- **Failed(reason)**：需要按 reason 排查（认证、网络、TLS、topic 权限等）

::: tip
连接状态只代表“插件的连接已建立”，不代表“消息一定已被平台消费成功”。消费/订阅验证仍然必须做。
:::

### 3.2 验证 topic / payload

按你选择的平台执行验证：

- Kafka：使用 `kcat`/`kafka-console-consumer` 消费对应 topic（建议先从 telemetry 开始）
- Pulsar：使用 `pulsar-client consume` 或 Pulsar Manager
- ThingsBoard：在平台 UI 查看 Gateway Telemetry/Attributes 是否到达
- OPC UA Server：使用 UAExpert 浏览 `Objects/NG-Gateway/...` 节点并读取值

::: tip
如果你启用了模板 topic（例如 `ng.uplink.{{event_kind}}.{{device_name}}`），请先用一个固定设备名做验证，避免模板变量缺失导致 topic 为空。
模板语法与变量表见：[`模板语法（Handlebars）`](/northward/templates/handlebars)、[`模板变量表`](/northward/templates/variables)
:::

---

## 4. 验证“下行/写回”（可选）

取决于插件能力：

- Kafka / Pulsar：支持从指定 downlink topic 收消息并映射为 `WritePoint/Command/RpcResponseReceived`
- ThingsBoard：支持 RPC/Attributes 等下行（由 topics + handlers 驱动）
- OPC UA Server：支持 OPC UA Write → 网关 `WritePoint` 写回

统一下行语义与协议见：

- [`下行总览`](/northward/downlink/overview)
- [`下行 EnvelopeJson`](/northward/downlink/envelope-json)
- [`下行 MappedJson + Filter`](/northward/downlink/mapped-json)

---

## 5. 常见问题（快速定位）

- **App 状态 Connected，但没有消息**：
  - 是否创建了 `AppSubscription`？
  - uplink mapping 是否 `enabled=true`？
  - topic 是否渲染为空（模板变量缺失）？
- **队列满（QueueFull / outbound queue rejected）**：
  - 是否把高频遥测与关键控制混在一个 App？
  - `QueuePolicy.capacity` 是否过小？
  - 平台侧消费是否变慢（Kafka lag / Pulsar backlog）？
- **断网后数据丢失**：
  - 当前版本仅内存 buffer，不是磁盘断网续传（见路线图）

更完整排障见：

- [`北向排障索引`](/northward/troubleshooting/overview)
