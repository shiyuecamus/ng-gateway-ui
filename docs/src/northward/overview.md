---
title: '北向架构总览'
description: 'NG Gateway 北向架构总览：北向是什么、Plugin/App/AppSubscription 心智模型、通用队列与重试配置，以及可靠性与数据格式的 Roadmap。'
---

# 北向架构总览

NG Gateway 的北向架构不仅仅是“把数据发到云端”，而是一个专为**高并发**、**弱网环境**和**数据一致性**设计的工业级数据管道。

本文档将帮助你建立北向的正确心智模型，并理解数据如何被路由、缓冲、批处理并最终交付给北向平台。

## 北向是什么

北向（Northward）负责把网关内部统一格式的 `NorthwardData` 数据，**可靠、可控、可观测**地交付给上层平台（云端 IoT 平台/消息中间件/自研服务等）。它的目标是：

- **解耦平台差异**：把“平台协议/鉴权/主题/接口”封装在插件内，避免核心逻辑被某个平台绑死。
- **统一交付语义**：用一致的路由、背压、重试、批处理策略来交付数据，而不是每个插件各搞一套。
- **性能优先**：在高频点位场景下尽量减少小包开销与无效复制，确保吞吐和延迟稳定。

:::: tip 设计原则
**北向只解决“路由、交付、确认、背压/重试”**；不要把南向协议细节、设备采集策略或现场编解码逻辑放进北向插件。
::::

## 心智模型：Plugin / App / AppSubscription

- **Plugin（插件）**：可安装的北向适配器产物（例如 MQTT/Kafka/ThingsBoard 等）。插件定义“如何连接与发送”，但不包含具体现场实例配置。
- **App（北向应用实例）**：某个 Plugin 的一个运行实例。你可以为同一个插件创建多个 App（例如不同租户、不同环境、不同 topic 规划）。`App.config` 是**插件私有配置**，而 `retry_policy` / `queue_policy` 是所有 App 共享的通用策略。
- **AppSubscription（应用订阅）**：定义某个 App **订阅哪些设备的数据**，并用 `priority` 表达在资源紧张时的优先级。核心路由器会按订阅把数据扇出给各个 App。

## 通用配置（所有北向 App 共享）

北向 App 除了插件私有的 `config` 之外，还内置两类通用策略（见 `ng-gateway-models/src/entities/app.rs`）：

- **`retry_policy`（`RetryPolicy`）**：统一的指数退避重试策略（用于连接重试、发送失败后的重试等）。
- **`queue_policy`（`QueuePolicy`）**：北向队列/缓冲策略（容量、丢弃或阻塞、离线缓冲等）。

> 说明：对外 JSON 字段通常使用 `camelCase`（例如 `retryPolicy.maxAttempts`），内部 Rust 结构体使用 `snake_case` 字段名。

### `RetryPolicy`（指数退避 + 次数/时长上限）

- **maxAttempts**：最大重试次数。`0` 表示不重试；`null`（None）表示无限重试（需谨慎）。
- **initialIntervalMs**：初始退避间隔（ms）。
- **maxIntervalMs**：最大退避上限（ms）。
- **randomizationFactor**：抖动系数（例如 `0.2` 表示 ±20% jitter，避免惊群）。
- **multiplier**：指数倍率（典型 `2.0`）。
- **maxElapsedTimeMs**：累计重试时长上限（ms，`null` 表示不限制）。

### `QueuePolicy`（背压与离线缓冲）

- **capacity**：主队列容量（条数）。
- **dropPolicy**：队列满时策略  
  - `0 = Discard`：直接丢弃并返回背压信号（推荐用于遥测高频场景，避免拖垮系统）。  
  - `1 = Block`：阻塞等待（最多 `blockDuration`），适合控制面/低频关键数据。
- **blockDuration**：`Block` 策略下的最大阻塞时长（ms）。
- **bufferEnabled**：未连接时是否启用“内存缓冲队列”（用于短时断链/抖动）。
- **bufferCapacity**：内存缓冲队列容量（条数）。
- **bufferExpireMs**：内存缓冲的过期时长（ms，`0` 表示不过期）。

## 1. 核心数据流向 (Pipeline)

数据从南向设备采集到最终推送到云端平台，经过了以下几个关键阶段：

```mermaid
graph LR
    A[南向采集 Southward] --> B(归一化 NorthwardData)
    B --> R{路由 Router<br/>(AppSubscription)}
    R --> C{缓冲队列 Buffer<br/>(QueuePolicy)}
    C --> E[批处理 Batcher]
    E --> F[北向发送 Dispatcher]
    F -->|Ack| G((提交 Commit))
    F -->|Fail| H[重试/背压]
    C -. Roadmap .-> D[磁盘缓存 Disk WAL]
    D -. Roadmap .-> C
```

1.  **归一化 (Normalization)**：所有南向协议（Modbus, S7, IEC104 等）的数据首先被转换为统一的内部 `NorthwardData` 格式，包含时间戳、质量戳 (Quality)、设备元数据等。
2.  **路由 (Routing)**：核心路由器根据 `AppSubscription` 决定“这条数据应该交付给哪些北向 App”，并按订阅进行扇出。
3.  **缓冲队列 (Buffer)**：数据进入基于内存的异步队列（MPSC Channel / bounded queue），解耦采集与发送的速度差异；队列容量与拥塞策略由 `QueuePolicy` 决定。
4.  **批处理 (Batching)**：为了提高网络吞吐，网关会将多条小消息合并为一个 Batch（如 MQTT 的数组 payload 或 Kafka 的 Batch），减少 TCP/IP 开销。
5.  **发送与确认 (Dispatch & Ack)**：数据发送给北向插件，等待传输层确认；失败时依据 `RetryPolicy` 与背压策略决定重试/丢弃/阻塞。

## 2. 可靠性与背压（现状与 Roadmap）

北向链路的可靠性不是“越多越好”，而是要在**不拖垮网关**的前提下，尽可能提高关键数据的交付成功率。当前版本建议优先用 `QueuePolicy` 与 `RetryPolicy` 做“可预测的粗粒度控制”，产品级的断网续传与精细化降级会在后续迭代中补齐。

### 2.1 断网续传（Disk-backed Buffer，Roadmap）

工业现场网络不稳定是常态。**磁盘 WAL + 回放（断网续传）属于产品级可靠性能力，我们会在后续迭代中完善实现**。

-   **触发条件（Roadmap）**：当北向网络中断或发送速度低于采集速度，且（未来）启用了磁盘缓冲能力时触发。
-   **持久化（Roadmap）**：将待上云数据写入磁盘 WAL，确保掉电不丢失（具体落盘格式与目录结构以实现为准）。
-   **自动回放（Roadmap）**：当网络恢复且队列有空闲时，从磁盘按 FIFO 回放补传；需保证“可控的回放速率”避免挤占实时链路。

:::: warning 当前状态
当前版本的可靠性主要依赖 **内存队列（`QueuePolicy`）+ 连接/发送重试（`RetryPolicy`）**。磁盘 WAL 断网续传与回放机制目前**尚未完整实现**（或实现仍较为粗糙），请不要将其作为强承诺能力依赖。
::::

#### 产品级最佳实践计划（建议按此做现场与运维规划）

- **容量预算**：按“点位频率 × 单点平均大小 × 目标断网时长”预估缓冲需求，并为 App 设置合理的 `capacity/bufferCapacity`。
- **分流隔离**：关键数据与高频遥测拆分到不同 App（不同队列/不同重试策略），避免互相拖累。
- **可观测性**：至少监控队列深度、丢弃计数、阻塞等待时间、重试次数/退避时长、发送延迟分位数。
- **预留磁盘**（Roadmap）：计划未来启用磁盘续传时，提前预留足够空间与 IOPS，并评估“回放速度上限”对北向带宽的冲击。

::: tip 配置建议
对于关键设施，建议将关键数据与遥测数据拆分到不同 App，并优先保障关键 App 的队列容量与重试窗口；对于高频遥测，请使用可预期的背压/丢弃策略以保护网关稳定性。
:::

### 2.2 QoS 降级策略（Backpressure & Drop，Roadmap）

当缓冲区达到极限时，网关必须做出取舍以防止崩溃。**更精细的“按优先级/数据类型/时效性”降级属于 Roadmap**。当前阶段建议主要通过 `QueuePolicy.dropPolicy` 与 App 拆分实现“粗粒度隔离”：

-   **高优先级保留**：把报警/事件/控制面响应放入独立 App，使用 `dropPolicy=Block`（并设置合理 `blockDuration`）或更大的队列容量。
    -   *原理：这些数据量小但价值高，应优先获得发送预算与重试窗口。*
-   **低优先级丢弃**：高频遥测优先使用 `dropPolicy=Discard`，并在南向侧做变化过滤/降采样（减少无意义重复上报）。
    -   *原理：时序数据的时效性往往比完整性更重要，过期的实时数据可能已无意义。*
-   **按订阅优先级路由**：利用 `AppSubscription.priority` 在资源紧张时优先保障高优先级 App（先保证其队列与发送预算）。

## 3. 并发与隔离模型

NG Gateway 采用 Rust 的 **Actor 模型** 实现高度并发与故障隔离。

-   **App/插件隔离**：每个北向 App 运行在独立的 Actor 中。如果某个 App 因配置错误进入失败态，不会影响其他 App 或南向采集任务。
-   **资源限制**：每个插件可以配置独立的 CPU 和内存配额（通过 Docker/K8s 部署时），防止某个慢速消费者拖垮整个网关。

## 4. 数据格式（现状与 Roadmap）

目前北向插件以 **JSON** 载荷为主。**Protobuf/Avro 等二进制载荷属于 Roadmap**：在大规模点位/高频上报/公网带宽昂贵场景下，它们能显著降低带宽与 CPU 开销，但需要更严格的 Schema 管理与版本兼容策略。

| 特性 | JSON | Protobuf / Avro |
| :--- | :--- | :--- |
| **可读性** | 高 (文本) | 低 (二进制) |
| **带宽消耗** | 高 (字段名重复) | **极低** (节省 60%+) |
| **CPU 开销** | 中 (解析慢) | 低 |
| **Schema 管理** | 不需要 (自描述) | **需要** (需版本管理) |
| **推荐场景** | 调试、快速对接、Web前端直接消费 | **大规模点位**、**高频上报**、公网带宽昂贵 |

### 产品级最佳实践计划（Protobuf/Avro，Roadmap）

- **统一 Envelope**：为二进制 payload 设计稳定的包络字段（例如 `schemaVersion`/`schemaId`/`contentType`/`encoding`），避免“只靠 topic 区分版本”导致运维复杂度爆炸。
- **版本兼容策略**：强制约束“向后兼容（Backward compatible）”演进，避免字段删除/语义变更破坏云端解析。
- **灰度与回滚**：建议支持“双写（JSON + Binary）/旁路验证”一段时间，确保云端解析稳定后再切换。
- **Schema 管理**：如接入 Schema Registry（Avro/Protobuf）或自研版本仓库，请把发布流程纳入 CI，避免手工发版造成漂移。

::: warning
当前网关暂未提供生产可用的 Protobuf/Avro 北向插件实现。后续迭代支持后，请务必保证网关侧的 `.proto`/Schema 版本与云端解析服务保持一致，并建立“向后兼容/灰度发布/双写验证”的升级流程，否则可能导致数据解码失败。
:::
