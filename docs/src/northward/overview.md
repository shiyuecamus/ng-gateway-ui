---
title: '北向架构总览'
description: 'NG Gateway 北向架构总览：北向是什么、Plugin/App/AppSubscription 心智模型、通用队列与重试配置，以及可靠性与数据格式的 Roadmap。'
---

# 北向架构总览

NG Gateway 的北向架构不仅仅是“把数据发到云端”，而是一个专为**高并发**、**弱网环境**和**数据一致性**设计的工业级数据管道。

本文档将帮助你建立北向的正确心智模型，并理解数据如何被路由、缓冲、批处理并最终交付给北向平台。

## 北向是什么

北向（Northward）是网关与上层平台之间的**双向集成边界**（Gateway ↔ Northward Platform），负责在统一的内部语义之上，完成数据面与控制/事件面的可靠交互：

- **`NorthwardData`（数据面）**：网关 → 北向平台的遥测/状态/指标等“上报数据”，要求**可靠、可控、可观测**地交付。
- **`NorthwardEvent`（控制/事件面）**：北向平台 ↔ 网关之间的命令、配置变更、订阅/路由变更、连接/会话事件、ACK/回执等“交互事件”，要求可追踪、可限流、可重试（必要时幂等）。

::: tip 北向的目标
- **解耦平台差异**：把“平台协议/鉴权/Topic/API/RPC 形状”封装在插件内，避免核心逻辑被某个平台绑死（双向同样适用）。
- **统一可靠性语义**：以一致的路由、背压、重试、超时、批处理与确认（Ack/Commit）语义来处理 `NorthwardData` 与 `NorthwardEvent`，而不是每个插件各搞一套。
- **性能优先**：在高频点位与弱网抖动场景下尽量减少小包开销与无效复制，确保吞吐、延迟与资源占用稳定且可预测。
:::

:::: warning 设计原则
**北向只解决“路由、交付/交互、确认、背压/重试、可观测性”**（覆盖 `NorthwardData` 与 `NorthwardEvent`）；不要把南向协议细节、设备采集策略或现场编解码逻辑放进北向插件。
::::

## 心智模型

- **Plugin（插件）**：可安装的北向适配器产物（例如 MQTT/Kafka/ThingsBoard 等）。插件定义“如何连接、发送与接收/订阅（含命令下行）”，但不包含具体现场实例配置。
- **App（北向应用实例）**：某个 Plugin 的一个运行实例。你可以为同一个插件创建多个 App（例如不同租户、不同环境、不同 topic 规划）。`App.config` 是**插件私有配置**，而 `retry_policy` / `queue_policy` 是所有 App 共享的通用策略。
- **AppSubscription（应用订阅）**：定义某个 App **订阅哪些设备的数据**，并用 `priority` 表达在资源紧张时的优先级。核心路由器会按订阅把数据扇出给各个 App。

## 通用配置

### App 通用属性

::: tip 说明
- `App.config` 是**插件私有配置**（由不同插件自行定义/解释）
- `retryPolicy/queuePolicy` 是所有 App 共享的通用策略（由 core 实现统一语义）。
:::

| 字段 | 类型 | 说明 | 建议 |
| --- | --- | --- | --- |
| `id` | `number` | App 唯一 ID（内部主键） | 仅内部使用 |
| `pluginId` | `number` | 关联的 Plugin ID | 选择对应插件后自动绑定 |
| `name` | `string` | App 名称（人类可读） | 与租户/环境/用途相关联，保持稳定 |
| `description` | `string \| null` | 描述（可选） | 记录平台端关键信息（如 topic 规划/租户） |
| `config` | `object` | 插件私有配置（形状由插件决定） | 配合插件文档使用；避免在多环境复用时遗漏差异 |
| `retryPolicy` | `RetryPolicy` | 通用重试策略（连接/发送失败重试等） | 生产建议设置有限次数或有限时长 |
| `queuePolicy` | `QueuePolicy` | 通用队列/背压/内存缓冲策略 | 高频遥测与关键链路分 App 隔离配置 |
| `status` | `Enabled \| Disabled` | 启用状态 | 灰度启用/停用便于排障 |

### `RetryPolicy`

> `RetryPolicy` 同时被 northward 与 southward 复用；本页聚焦北向语义。

| 字段 | 类型 | 说明 | 建议 |
| --- | --- | --- | --- |
| `maxAttempts` | `number \| null` | 最大重试次数。`null` 表示无限重试；`0` 的语义因实现而异（当前实现中通常等价于“不限制/持续重试”，请谨慎）。 | 生产建议使用有限次数或有限时长；不要无限重试掩盖配置错误。 |
| `initialIntervalMs` | `number` | 初始退避间隔（ms） | 1000~3000 |
| `maxIntervalMs` | `number` | 最大退避间隔（ms） | 30000~60000 |
| `multiplier` | `number` | 指数倍率（典型 2.0） | 2.0 |
| `randomizationFactor` | `number` | 抖动系数（±百分比），避免惊群 | 0.1~0.3 |
| `maxElapsedTimeMs` | `number \| null` | 最大累计重试时长（ms），`null` 表示不限制 | 建议设置，例如 10~30 分钟 |

::: warning 关于 `maxAttempts=0` 的注意事项
不同组件对 `0` 的解释可能不同（常见有“禁用重试”或“无限重试”两种约定）。  
在本项目当前实现中，多处 `should_retry()` 把 `None | Some(0)` 当作“继续重试”，因此你应把 `0` 当作“无限/不限制”，避免误配。
:::

### `QueuePolicy`

| 字段 | 类型 | 说明 | 建议 |
| --- | --- | --- | --- |
| `capacity` | `number` | 主队列容量（Gateway → Plugin） | 遥测：按吞吐预算设置；关键链路：适当放大 |
| `dropPolicy` | `Discard \| Block` | 队列满时策略 | 高频遥测：Discard；关键链路：Block |
| `blockDuration` | `number` | Block 策略最大阻塞时长（ms） | 50~500ms（避免拖垮热路径） |
| `bufferEnabled` | `boolean` | 插件未连接时是否启用**内存 buffer** | 只用于短时抖动，不要当断网续传 |
| `bufferCapacity` | `number` | 内存 buffer 容量（条数，FIFO） | 按“可容忍断链窗口”粗估 |
| `bufferExpireMs` | `number` | buffer 过期时间（ms），`0` 不过期 | 建议设置（例如 60s~10min） |

> Roadmap：我们计划将离线缓冲演进为对用户可配置的 **`bufferType`**（Memory / Disk WAL / Hybrid），并提供配额、清理与回放限速等产品级能力；详见下文 **3.1（路线图）** 与 **3.2（策略矩阵/推荐默认）**。

## 1. 上行数据流向

**上行（网关 → 北向平台）**：数据从南向采集进入网关后，如何被路由、缓冲、批处理并交付给北向平台。

它通常承载（`NorthwardData`）：

- **Telemetry**：遥测数据
- **Attributes**：属性数据（client/shared/server attributes）
- **DeviceConnected**：设备上线
- **DeviceDisconnected**：设备离线
- **Alarm**：告警/事件
- **RpcResponse**：设备侧 RPC 响应
- **WritePointResponse**：写点结果响应

1.  **归一化 (Normalization)**：所有南向协议（Modbus, S7, IEC104 等）的数据首先被转换为统一的内部 `NorthwardData` 格式，包含时间戳、质量戳 (Quality)、设备元数据等。
2.  **路由 (Routing)**：核心路由器根据 `AppSubscription` 决定“这条数据应该交付给哪些北向 App”，并按订阅进行扇出。
3.  **缓冲队列 (Buffer)**：数据进入基于内存的异步队列（MPSC Channel / bounded queue），解耦采集与发送的速度差异；队列容量与拥塞策略由 `QueuePolicy` 决定。
4.  **批处理 (Batching)**：为了提高网络吞吐，网关会将多条小消息合并为一个 Batch（如 MQTT 的数组 payload 或 Kafka 的 Batch），减少 TCP/IP 开销。
5.  **发送与确认 (Dispatch & Ack)**：数据发送给北向插件，等待传输层确认；失败时依据 `RetryPolicy` 与背压策略决定重试/丢弃/阻塞。

## 2. 下行数据流向

**下行（北向平台 → 网关）**：平台侧控制消息如何被插件消费、解码/过滤、转为事件并由 core 执行。
它通常承载：

- **WritePoint**：点位写入
- **CommandReceived**：动作/命令下发
- **RpcResponseReceived**：平台回执/交互事件

1.  **入口接入 (Ingress)**：北向插件监听各自协议的“下行入口”，接收控制请求/事件（并非只有 Topic 模型）：
    - **Kafka/Pulsar**：订阅**精确 topic**（不可模板/通配/regex）并消费消息（Kafka commit / Pulsar ack/nack）。
    - **ThingsBoard**：订阅 ThingsBoard 约定的 MQTT topics，由 router/handlers 处理 Publish（MQTT 层 ack 由协议处理）。
    - **OPC UA Server**：接收客户端 OPC UA Write 请求（返回 OPC UA `StatusCode` 作为回执）。
2.  **归一化 (Normalization)**：将协议层输入（Kafka record / Pulsar message / MQTT publish / OPC UA write）归一化为统一的内部事件模型 `NorthwardEvent`（WritePoint / CommandReceived / RpcResponseReceived）。
3.  **投递 (Dispatch to Core)**：将归一化后的 `NorthwardEvent` 通过 `events_tx` 投递到 Gateway core（Plugin -> Core），形成统一控制面入口。
4.  **校验与串行化执行 (Validate & Serialize Execute)**：core 对事件做强校验（NotFound/NotWriteable/TypeMismatch/OutOfRange/NotConnected/QueueTimeout 等），并按 **Channel 内严格串行** 的写入/动作队列执行，最终调用 southward driver（`write_point` / `execute_action`）。
5.  **确认/响应 (Ack/Response)**：根据插件的“回执机制”完成最终确认：
    - **Kafka/Pulsar**：按 `AckPolicy/FailurePolicy` 决定 commit / ack / nack（避免 poison message 卡死）。
    - **OPC UA Server**：将执行结果映射为 OPC UA `StatusCode` 返回给客户端，并（成功时）更新 AddressSpace 值。
    - **ThingsBoard**：按其协议语义完成响应/回执（具体以 handlers 逻辑与平台约定为准）。

::: warning 关于“写回响应是否会再发回平台”
Core 会生成 `WritePointResponse` / `RpcResponse` 等响应对象；但**是否会被某个北向插件继续上送给平台**取决于插件是否实现对应 uplink 映射。  
当前版本 Kafka/Pulsar/ThingsBoard 的 uplink 主要覆盖 Telemetry/Attributes/上下线事件；写回响应更多用于网关内部闭环（例如 OPC UA Write 返回状态码）。
:::

## 3. 可靠性与背压

北向链路的可靠性不是“越多越好”，而是要在**不拖垮网关**的前提下，尽可能提高关键数据的交付成功率。

一个常见误区是把“断网续传（WAL）”与“队列满时降级（QoS）”拆开设计。最佳实践是把它们视为同一件事：当下游**不可达**或**变慢**时，网关需要用同一套规则回答：

- **哪些数据值得占用内存/磁盘/带宽预算？**
- **哪些数据应当合并（last）、采样（rate limit）或按时效性丢弃（TTL）？**
- **网络恢复后如何补传，同时不挤占实时链路？**

### 3.1 统一设计：离线缓冲（BufferType）+ QoS 降级 + 回放隔离（Roadmap）

工业现场网络不稳定是常态；同时，“在线但拥塞”往往比“完全断网”更常见。我们计划将可靠性能力统一为一套策略引擎，在不同运行状态下自动切换策略强度。

#### 运行状态（建议的内部心智模型）

- **Normal（在线且不拥塞）**：实时优先，尽量少做额外处理。
- **Congested（在线但下游变慢/队列逼近上限）**：开始执行合并/采样/TTL，以保护网关稳定性。
- **Offline（离线/不可达）**：进入离线缓冲（Hybrid/DiskWal），并更激进地“保新弃旧”。
- **Replay（恢复连接且存在 backlog）**：补传在独立预算下进行，**永远不允许挤占实时链路**。

#### 统一处理流水线（同一套逻辑同时覆盖“离线”和“队列满”）

对每条待上云数据（可抽象为 `Record{kind,key,ts,payload,priority}`）建议按以下顺序处理：

1. **TTL Gate（按时效性丢弃）**：超过 `maxAgeMs` 的数据直接丢弃（尤其是 Telemetry），并记录丢弃原因（expired）。
2. **CoalesceLast（按 last 合并）**：对同一 `key` 仅保留最新值，避免把“过期过程数据”持续入队/落盘。  
   - key 建议：`(app_id, device_id, point/metric, quality_tag?)`（具体以数据模型实现为准）。
3. **Sampling / Rate limit（采样/限速）**：对高频 Telemetry 按窗口采样或限速，控制写盘量与回放压力。
4. **Admission（准入：内存 / WAL / 丢弃 / 阻塞）**：根据 `bufferType` 与当前状态决定落点：  
   - Normal：优先进入内存队列。  
   - Congested：先做压缩（2/3），再决定入队；必要时触发丢弃或溢出到 WAL（Hybrid）。  
   - Offline：压缩后进入 WAL（DiskWal/Hybrid）。  
5. **Dispatch / Replay（发送/回放调度）**：在线实时发送；恢复后按回放预算补传（见 3.2）。

#### 设计路线图（Roadmap）：BufferType / WAL / 回放

- **可配置的 `bufferType`**：面向不同现场约束提供明确选择  
  - **`Memory`**：纯内存队列，延迟最低、实现简单；适合可容忍短时丢失或上游本身可重放的场景。  
  - **`DiskWal`**：WAL-first（先落盘再发送），适合“完整性交付优先”的关键数据（会增加磁盘 IOPS 与端到端延迟）。  
  - **`Hybrid`**：实时链路优先走内存队列；当断链/拥塞或达到内存上限时，数据写入 WAL 续传；适合“实时优先 + 断网不丢”的折中方案（推荐默认目标形态）。
- **WAL 的可运维性**：WAL 记录具备 **校验/版本化** 与崩溃恢复能力，并输出“可解释的丢弃原因”（例如磁盘满/超配额/过期/格式不兼容）。
- **回放（断网续传）**：网络恢复后按 FIFO/时间顺序回放历史数据，且**可控限速**，避免历史补传挤占实时吞吐（实时/回放隔离见 3.2）。
- **配额与清理**：提供**磁盘配额（maxBytes / maxSegments）+ 过期清理（TTL）**，确保不会占满磁盘影响网关自身稳定性。

:::: warning 当前状态
当前版本的可靠性主要依赖 **内存队列（`QueuePolicy`）+ 连接/发送重试（`RetryPolicy`）**。磁盘 WAL 断网续传与回放机制目前**尚未完整实现**（或实现仍较为粗糙），请不要将其作为强承诺能力依赖。
::::

#### 产品级最佳实践计划（建议按此做现场与运维规划）

- **容量预算**：按“点位频率 × 单点平均大小 × 目标断网时长”预估缓冲需求，并为 App 设置合理的 `capacity/bufferCapacity`。
- **分流隔离**：关键数据与高频遥测拆分到不同 App（不同队列/不同重试策略），避免互相拖累。
- **可观测性**：至少监控队列深度、丢弃计数（按原因/数据类型拆分）、阻塞等待时间、重试次数/退避时长、发送延迟分位数；如启用 WAL/回放，还应监控 WAL 占用、回放 backlog、回放速率与回放丢弃原因。
- **预留磁盘与 IOPS**（Roadmap）：计划启用磁盘续传时，提前预留空间与 IOPS，并评估“回放速度上限”对北向带宽/CPU 的冲击；建议把 WAL 目录放在独立数据盘或为其预留配额。

::: tip 配置建议
对于关键设施，建议将关键数据与遥测数据拆分到不同 App，并优先保障关键 App 的队列容量与重试窗口；对于高频遥测，请使用可预期的背压/丢弃策略以保护网关稳定性。
:::

### 3.2 策略矩阵与推荐默认（Best Practices）

#### 策略矩阵（按数据类型 × 运行状态）

| 数据类型 | Normal（在线） | Congested（拥塞） | Offline（离线） | Replay（补传） |
| :--- | :--- | :--- | :--- | :--- |
| **控制面 / 告警 / 事件** | 原样发送 | **不降级**（必要时 Block） | Hybrid/DiskWal（尽量完整） | 回放独立预算，优先不影响实时 |
| **Attributes（状态/属性）** | 原样发送 | **CoalesceLast** | CoalesceLast 后入 WAL（只保最终态） | 低速补传（通常量小） |
| **Telemetry（高频时序）** | 可选轻度采样 | **CoalesceLast + Sampling + TTL**（保新弃旧） | 更激进 Sampling + TTL；压缩后再入 WAL | 严格限速 + TTL；永不挤占实时 |

> 解释：离线与队列满并不冲突。离线时同样必须做合并/采样/TTL，否则 WAL 会被写爆、回放会拖垮系统；拥塞时同样可以（Hybrid）把“压缩后的数据”溢出到 WAL 以缓冲尖峰。

#### 回放隔离（关键时序设计）

建议采用“两条逻辑通道 + 预算隔离”的设计（Roadmap）：

- **Realtime lane**：实时数据永远优先，保证低延迟。
- **Replay lane**：历史回放独立限速/并发，并通过“发送预算占比/令牌桶”控制上限（例如回放最多占用 20% 发送预算）。

#### 当前版本可用的落地建议（现在就能做）

当前阶段建议主要通过 `QueuePolicy.dropPolicy` 与 App 拆分实现“粗粒度隔离”（把策略“外置”为多个 App 来隔离资源与失败域）：

- **高优先级保留**：把报警/事件/控制面响应放入独立 App，使用 `dropPolicy=Block`（并设置合理 `blockDuration`）或更大的队列容量。  
  - *原理：这些数据量小但价值高，应优先获得发送预算与重试窗口。*
- **低优先级保新弃旧**：高频遥测优先使用 `dropPolicy=Discard`，并在南向侧做变化过滤/降采样；将 “last 合并 / TTL / 采样” 作为未来演进方向（Roadmap）。  
  - *原理：时序数据的时效性往往比完整性更重要，过期的实时数据可能已无意义。*
- **按订阅优先级路由**：利用 `AppSubscription.priority` 在资源紧张时优先保障高优先级 App（先保证其队列与发送预算）。

## 4. 并发与隔离模型

NG Gateway 采用 Rust 的 **Actor 模型** 实现高度并发与故障隔离。

-   **App/插件隔离**：每个北向 App 运行在独立的 Actor 中。如果某个 App 因配置错误进入失败态，不会影响其他 App 或南向采集任务。

## 5. 数据格式

目前北向插件以 **JSON** 载荷为主，并且提供多种“可预测的 JSON 形状”以平衡可读性与吞吐：

- **EnvelopeJson（推荐默认）**：稳定协议包络（`schema_version` + `event.kind` + `payload.data`），适用于对接与长期演进
- **Kv / TimeseriesRows**：更偏吞吐/TSDB 的扁平化形状（可选包含 meta）
- **MappedJson**：声明式映射（把内部数据映射成你平台期望的字段结构）

> 详细协议见：[`EnvelopeJson（稳定包络）`](/northward/payload/envelope-json)。

**Protobuf/Avro 等二进制载荷属于 Roadmap**：在大规模点位/高频上报/公网带宽昂贵场景下，它们能显著降低带宽与 CPU 开销，但需要更严格的 Schema 管理与版本兼容策略。

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
