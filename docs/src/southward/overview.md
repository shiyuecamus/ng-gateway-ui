---
title: '南向总览'
description: 'NG Gateway 南向体系概览：驱动模型、设备连接、采集策略、解析容错与性能最佳实践。'
---

## 南向是什么

南向负责把“现实世界的设备/总线/控制器”稳定接入网关，并把读写结果标准化为统一的 `NorthwardData` 进入核心管线与北向。它的目标是**可靠、可观测、可扩展、性能优先**。

::: tip 设计原则
**南向只解决“如何连接、如何采集、如何编解码、如何容错”**；不要在 driver 里绑定北向协议、业务规则或平台差异。
:::

## 心智模型：Driver / Channel / Device / Point / Action

- **Driver**：协议适配器（Modbus/S7/OPC UA/IEC104…），负责连接管理、协议编解码、读写语义与容错策略。

- **Channel（通道）**：driver 的一个“运行实例”。一个 channel 绑定一个 driver factory + 一份运行时配置（连接策略、采集策略等），其下面挂载多个device。  
  Channel 是**连接与会话的边界**：同一协议的不同现场线路/PLC/服务器通常用不同 channel 隔离。

- **Device（设备）**：channel 下的一个采集对象（站点/PLC/表计/节点）。Device 的 `device_type` 用于 driver 做模型选择/差异化解析。

- **Point（点位）**：device 下的一个数据点（遥测/属性），携带点位类型、数据类型、访问模式（只读/只写/读写）以及单位/量程/比例等元信息。Point 的 `key` 是对外稳定标识，`id` 是网关内部高频热路径主键。

- **Action（动作）**：device 下的一个命令/RPC 定义（例如“合闸/分闸/复位/写参数”）。Action 的 `command` 是 driver 识别的命令名，输入参数由 `Parameter` 描述（类型/必填/默认值/范围）。

## Polling vs Driver Push

当前网关有且仅有两条“南向 → 核心 → 北向”的数据路径；两条路径在进入 core 之后**完全复用同一条转发/路由链路**。

### 1) Polling（轮询采集，由 Collector 调度）

- **适用场景**：Modbus/S7 等“读寄存器/读变量”为主的协议；或现场要求固定周期采集。
- **触发机制**：当且仅当 channel 的 `collection_type == Collection` 时，该 channel 才会被 `Collector` 拉起轮询任务；`period` 决定 tick 周期。
- **核心链路**：
  - `Collector` 按 channel tick → 并发遍历 device（`buffer_unordered` + 全局 `Semaphore` 做有界并发）  
  - 每个 device：调用 `driver.collect_data(device, points)`  
  - 返回 `Vec<NorthwardData>` → 逐条发送到 core 的 **bounded mpsc**（数据转发队列）
  - `Gateway` forwarding task 从队列 `recv` → 广播给实时监控（realtime hub）→ `NorthwardManager::route`（快照/变化过滤 + 按“北向 app 订阅”路由到各 app）

::: tip 关键语义
Polling 的“调度者”是 core 的 `Collector`，driver 只实现“如何高效读点位与解析”。
:::

### 2) Driver Push（订阅/上报，由 Driver 自己驱动）

- **适用场景**：OPC UA subscription、IEC104 主动上送、DNP3 SOE、任何协议的异步事件/变化上报。
- **触发机制**：driver 在 `start()` 后自行建立订阅/监听/接收循环，遇到数据时直接 publish。
- **核心链路（按实现）**：
  - 网关在创建 driver 时，会通过 `SouthwardInitContext` 注入一个 `publisher: Arc<dyn NorthwardPublisher>`  
  - driver 在内部任务里调用 `publisher.try_publish(Arc<NorthwardData>)`（非阻塞，背压通过错误返回）  
  - 数据进入同一条 core 转发队列 → forwarding task → `NorthwardManager::route`（与 Polling 完全一致）

::: tip 关键语义
Subscription不是由 `Collector` 调度；它属于 driver 的“会话层/协议层”职责，core 只提供一个高性能的 publish 入口与后续统一路由。
:::

## 反向路径

反向路径的共同目标是：**在尽可能靠近入口处做“可判定”的校验与限流**，避免把非法/高风险/洪峰请求直接打到现场设备。

### WritePoint（点位写入）

- **入口**：北向插件下行事件 `NorthwardEvent::WritePoint`。
- **core 侧校验**：
  - **NotFound**：point_id 不存在。
  - **NotWriteable**：点位 `access_mode` 不是 `Write/ReadWrite`。
  - **TypeMismatch**：写入值与点位 `data_type` 不匹配。
  - **OutOfRange**：仅数值类型；当 **min_value 与 max_value 都存在** 时，对写入值做区间校验。
  - **NotConnected**：所属 channel 未连接。
  - **QueueTimeout**：同一 channel 的写入串行队列等待超时。
- **串行化与并发模型**：
  - **同一 channel 内写入严格串行**（避免协议/设备不支持并发写导致的乱序与状态撕裂）。
  - **不同 channel 之间可并行**（网关会把 WritePoint 处理丢进独立 task，充分利用多核与 I/O 并发）。
- **执行**：通过 `driver.write_point(device, point, value, timeout_ms)` 进入 driver。
- **响应**：写入完成后回传 `NorthwardData::WritePointResponse`（控制面响应不会被“数据背压”丢弃）。

### ExecuteAction（动作/命令）

- **入口**：北向插件下行事件 `NorthwardEvent::CommandReceived`。
- **core 侧校验**：
  - **NotFound**：action 不存在。
  - **TypeMismatch**：写入值与点位 `data_type` 不匹配。
  - **OutOfRange**：仅数值类型；当 **min_value 与 max_value 都存在** 时，对写入值做区间校验。
  - **NotConnected**：所属 channel 未连接。
  - **QueueTimeout**：同一 channel 的写入串行队列等待超时。
- **执行**：通过 `driver.execute_action(device, action, parameters)` 进入 driver。
- **响应**：写入完成后回传 `NorthwardData::RpcResponse`（控制面响应不会被“数据背压”丢弃）。

## 通用属性

### Channel 通用属性

- **name**：人类可读名称（日志/监控/诊断的首选标识）。
- **driver_id**：绑定的 driver 工厂标识。
- **collection_type**：采集类型
  - `Collection` 表示该 channel 会被 `Collector` 轮询
  - `Report` 表示该 channel 不参与轮询，主要依赖 driver 主动 Push（订阅/上报）。
- **report_type**：上报策略
  - `Always` 全量上报；
  - `Change` 由 core 维护 device 快照并做变化过滤（减少北向带宽与计算）。
- **period**：轮询周期（ms，仅在`collection_type == Collection` 时生效）。
- **status**：启用/禁用。禁用 channel 不会被启动/轮询/路由。
- **connection_policy**：连接策略（由 core 提供统一字段，具体行为由 driver 在连接/读/写处使用）
  - **connect_timeout_ms**：建立连接/会话握手超时（默认 10000ms）。
  - **read_timeout_ms**：协议读超时（默认 10000ms）。
  - **write_timeout_ms**：协议写超时（默认 10000ms）。
  - **backoff（RetryPolicy）**：用于重连/重试的统一指数退避策略（driver 与北向插件复用同一模型）
    - **max_attempts**：最大重试次数（`Some(0)` 表示不重试；`None` 表示无限重试，需谨慎）。
    - **initial_interval_ms**：初始退避间隔（默认 1000ms）。
    - **max_interval_ms**：最大退避上限（默认 30000ms）。
    - **multiplier**：指数倍率（默认 2.0）。
    - **randomization_factor**：抖动系数（默认 0.2，代表 ±20% jitter，避免“重连风暴/惊群”）。
    - **max_elapsed_time_ms**：最大累计重试时长（默认 None，表示不限制；与 max_attempts 同时设置时先到者生效）。

### Device 通用属性

- **device_name**：设备名称（用于 northward 编码与可观测性）。
- **device_type**：设备类型/机型。
- **channel_id**：所属 channel ID。
- **status**：启用/禁用（禁用设备应在 driver 侧与 core 路由侧被跳过）。

### Point 通用属性

- **id**：point 唯一 ID（热路径主键，变化检测/快照索引优先用它）。
- **device_id**：所属 device ID。
- **name**：点位名称（人类可读）。
- **key**：点位稳定 key（对外引用/写回/主题路由的首选标识）。
- **type**：点位类别（Telemetry / Attribute）。
- **data_type**：值类型（bool/i32/f64/string/…）。
- **access_mode**：访问模式（Read / Write / ReadWrite）
  - **何时使用**：
    - **采集侧**：core 会按 `access_mode` 过滤可读点位（Read/ReadWrite）用于采集；过滤可写点位（Write/ReadWrite）用于写入能力展示/路由。
    - **写入侧**：WritePoint 入口会用它做强校验；非 `Write/ReadWrite` 会被直接拒绝并返回 `NotWriteable`。
  - **注意事项**：
    - `Read` 并不代表“协议不支持写”，而是产品/现场层面的**安全边界**；应在建模阶段正确配置，避免误写关键点位。
    - `ReadWrite` 的点位，driver 必须保证读写路径对同一地址/变量的语义一致（单位/比例/编码）。
- **unit**：展示单位（如 ℃、kPa、A），通常用于 UI 与北向展示，不建议在热路径字符串拼接。
- **min_value / max_value**：
  - **何时使用**：反向入口对数值类型做区间校验（仅当 min 与 max 同时存在时生效），超出范围返回 `OutOfRange`，避免危险写入落到设备侧。
  - **注意事项**：当前 core 的范围校验直接比较写入值与 `[min,max]`，不会自动应用 `scale`；因此 **min/max 必须与外部写入值处于同一“值域”（原始值或工程值）**。
- **scale**（比例/换算因子）：
  - **使用场景**：常用于“协议原始值 ↔ 工程值”的换算（例如寄存器值 1234 表示 12.34℃，scale=0.01）。
  - **注意事项**：在当前实现中，scale 主要作为元数据透传至driver；是否在读写时应用 scale 由 driver 决定。若 driver 选择对外暴露工程值，则应同时保证：
      - 上行采集输出与下行写入输入都使用同一尺度；
      - min/max 也按工程尺度配置，才能与 core 的 `OutOfRange` 校验对齐。

### Action & Parameter 通用属性

- **Action.id**：动作唯一 ID。
- **Action.name**：动作名称（人类可读）。
- **Action.device_id**：所属 device ID。
- **Action.command**：driver 识别的命令名（协议/实现相关，但对外稳定）
  - **何时使用**：core 在执行动作时通过 `command` 定位要执行的 action（因此 command 应稳定且同设备内唯一）。
  - **注意事项**：建议把 “协议动作名/功能码/对象地址” 等编码细节封装在 driver 内部，不直接暴露为不可读字符串；对外提供稳定 command，同时在文档里解释其含义。
- **Action.input_parameters**：输入参数定义列表（`Parameter`）。

- **Parameter.name/key**：参数展示名/稳定 key。
- **Parameter.data_type**：参数类型。
- **Parameter.required**：是否必填。
- **Parameter.default_value**：默认值（如有）。
- **Parameter.min_value / max_value**：范围约束（如有）。

Parameter 在动作执行时会被 core 统一校验与解析，关键语义如下：

- **参数结构**：
  - 多参数动作：`params` 必须是 JSON Object（按 `key` 取值）。
  - 单参数动作：允许直接给标量（scalar），也允许给 `{key: value}`。
- **必填与默认值**：
  - `required=true`：必须提供（否则报错）。
  - `required=false`：允许不提供，但必须有 `default_value`（否则报错）。
- **类型转换（尽量宽容，但可预测）**：会把 JSON scalar 尝试转换成目标 `data_type`（包含数字字符串、bool 字符串、时间戳、binary 的 base64/hex 等常见形式）。
- **范围校验**：当 Parameter 声明了 `min_value/max_value` 时，会对数值型输入做区间校验，并汇总成可读的错误信息返回。

## 最佳实践

### 背压与队列

- **publisher.try_publish 是非阻塞的**：当 core 转发队列满时会返回 `QueueFull`（背压信号）。driver 必须决定策略：丢弃、聚合、降采样、重试（带退避），而不是在热路径里无界堆积。
- **批量优先**：Polling 场景下，driver 应尽量将一次采集结果组成少量 `NorthwardData`（例如按 device 分组），减少发送次数与调度开销。

### 轮询采集（Polling）

- **避免每设备 `tokio::spawn`**：当前 `Collector` 已采用 `buffer_unordered` + `Semaphore`，driver 侧也应避免在单次采集里产生大量短生命周期 task。
- **超时/重试/退避要可配置**：使用 `connection_policy` 提供的超时与 backoff；连续失败要指数退避，避免重连风暴。
- **批量读取策略**：按协议能力将点位拆成批次（上限/对齐/地址连续性），并将批大小、并发度、超时做成可调参数。

### 订阅/上报（Subscription/Push）

- **订阅循环要可取消**：在 `stop()` 时保证能快速退出（配合取消令牌/会话生命周期）。
- **噪声与抖动隔离**：对频繁变化点位要有采样/节流，避免把北向/核心队列打满。

### 解析容错

- **解析失败不 panic**：坏帧/半包/CRC 错/乱序都必须返回可操作的错误语义，并携带足够上下文（channel/device/地址/计数器）。
- **可恢复同步**：出现坏帧应丢弃并重新同步帧头；出现短暂超时应可重试；出现认证失败/连接断开应触发重连路径。
- **错误分级**：区分“可重试/需重连/不可重试/需降级”，把“现场噪声”限制在本 channel 内，不扩散到全局。

### 运行时变更（RuntimeDelta）

网关支持在运行中对 device/point/action 做增删改并通知 driver（`RuntimeDelta`）。driver 的实现应：

- **增量更新本地索引**：避免全量重建；
- **保证顺序与幂等**：同一 channel 内 delta 需要按序处理；
- **不要在持锁状态 await**：更新结构应尽量快，I/O 放到后台任务。
