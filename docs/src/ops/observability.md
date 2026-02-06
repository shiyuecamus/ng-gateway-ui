---
title: '可观测性（Metrics / Logs / Realtime）'
description: 'NG Gateway 可观测性指南：Prometheus 指标（/metrics）、UI 聚合指标 WS（/api/ws/metrics）、设备实时快照 WS（/api/ws/monitor）、统一日志系统与排障 SOP。'
---

# 可观测性

本文面向运维与二次开发者，目标是让你在 **不猜、不拍脑袋** 的前提下，快速回答这些问题：

- 网关是否存活？是否有明显的资源瓶颈（CPU/内存/磁盘/网络）？
- 南向通道是否稳定？吞吐、延迟、重连、超时、背压是否异常？
- 北向 App 是否稳定？发送成功率、drops、错误与重试是否异常？
- “采集正常但上报异常”还是“采集本身就异常”？
- 如何用统一日志 + 指标 + 实时快照构建 **标准化排障 SOP**？

NG Gateway 的可观测性由 4 条链路组成（从轻到重）：

- **Health（存活探针）**：`GET /health`
- **Prometheus Metrics（长周期、可告警）**：`GET /metrics`
- **UI 聚合指标流（低基数实时概览）**：`GET /api/ws/metrics`
- **设备实时数据快照（排障专用，高基数不进 Prom）**：`GET /api/ws/monitor`

> 重要原则：**Prometheus 永远保持低基数**（禁止 device/point 进入 labels），否则会导致时序库爆炸；设备/点位级别观测统一走 WS Monitor 或专用诊断 API。

---

## 1. 快速开始：你应该从哪里看？

- **网关总览（Dashboard）**：看资源、连接率、采集平均耗时、网络吞吐  
  - UI：仪表盘 / 网关总览（对应 WS `scope=global`）
- **南向通道观测（Channel Observability）**：看 TX/RX、延迟、成功率、采集超时、上报 drops  
  - UI：南向 / 通道 / 观测（对应 WS `scope=channel + device`）
- **北向 App 观测（App Observability）**：看发送、drops、errors、retries、平均延迟  
  - UI：北向 / App / 观测（对应 WS `scope=app`）
- **设备实时监控（Realtime Monitor）**：看某设备 telemetry/attributes 的最新快照与变化  
  - UI：运维 / 数据监控（对应 WS `GET /api/ws/monitor`）

当你面对一次故障，建议固定一个顺序（SOP）：

1. **先看 Dashboard**：资源是否异常、整体错误率是否抬升
2. **再看具体通道/具体 App 的 Observability**：把问题范围缩到 1 个 channel/app
3. **必要时启用临时日志级别（TTL override）并复现**：见 [`配置管理`](./configuration.md)
4. **最后用 Realtime Monitor 验证设备数据链路**：南向是否采集到、值是否变化

---

## 2. Endpoint 总览

| 能力 | Endpoint | 用途 | 典型消费者 |
|---|---|---|---|
| Health | `GET /health` | 存活探针（LB/K8s readiness/liveness） | K8s Probe / 负载均衡 |
| Prometheus metrics | `GET /metrics` | 标准 Prometheus exposition（Pull） | Prometheus / VictoriaMetrics |
| UI 聚合指标（WS） | `GET /api/ws/metrics` | UI 实时指标（低基数快照） | Web UI |
| 设备快照（WS） | `GET /api/ws/monitor` | 设备 telemetry/attributes 实时查看（排障） | Web UI / 工具脚本 |

::: warning 安全建议
- **`/metrics` 建议只对集群内 Prometheus 开放**（NetworkPolicy / SecurityGroup / Ingress ACL），避免被外部探测/刷爆。
- **`/api/ws/*` 属于管理面**，通常需要登录态/鉴权；不要暴露到公网。
:::

---

## 3. Prometheus Metrics

### 3.1 关键设计

- 指标命名空间：统一 `ng_gateway_*`（内部 Registry namespace = `ng_gateway`）
- **低基数**：labels 上限可证明（允许 `channel_id/app_id/plugin_id/driver` 等有限维度；禁止 device/point）
- **scrape-time refresh**：系统资源与队列深度在 scrape 时刷新，保证 Pull 看到的是“新鲜值”

::: tip
这保证了：Prometheus 指标既能做`告警`，又不会在大规模设备/点位场景把 TSDB `撑爆`。
:::

### 3.2 指标字典

以下是当前实现中“最常用、最能定位问题”的指标族（不穷举所有 buckets 与衍生序列）。

#### (A) 系统资源（scrape-time）

- `ng_gateway_system_cpu_usage_ratio`：系统 CPU 使用率（0~1）
- `ng_gateway_system_memory_usage_ratio`：系统内存使用率（0~1）
- `ng_gateway_system_disk_usage_ratio`：根分区磁盘使用率（0~1）
- `ng_gateway_process_cpu_usage_ratio`：网关进程 CPU 使用率（0~1，best-effort）
- `ng_gateway_process_memory_rss_bytes`：网关进程 RSS（bytes，best-effort）
- `ng_gateway_network_bytes_sent_total` / `ng_gateway_network_bytes_received_total`：进程期累计网络字节（best-effort）

#### (B) 队列与背压（全局通用）

所有“有界队列（bounded channel）”都会注册同一套指标，labels 只有 `queue` 和有限的 `reason`。

- `ng_gateway_queue_depth{queue="collector_outbound"}`：队列深度（best-effort）
- `ng_gateway_queue_capacity{queue="collector_outbound"}`：队列容量
- `ng_gateway_queue_dropped_total{queue="...",reason="full|timeout|closed|buffer_full|expired"}`：丢弃累计
- `ng_gateway_queue_blocked_seconds_bucket|sum|count{queue="..."}`：发送端阻塞耗时（背压强度）

#### (C) Collector（采集引擎）

- `ng_gateway_collector_cycles_total{result="success|fail|timeout"}`：采集循环次数（按结果）
- `ng_gateway_collector_cycle_seconds_bucket|sum|count{result="..."}`：采集循环耗时分布
- `ng_gateway_collector_active_tasks`：当前活跃采集任务数
- `ng_gateway_collector_concurrency_permits{state="current|available"}`：并发许可（当前/剩余）
- `ng_gateway_collector_retries_total{reason="timeout|error"}`：采集重试累计

#### (D) Southward（南向）

管理面（无 labels）：

- `ng_gateway_southward_channels_total`
- `ng_gateway_southward_channels_connected`
- `ng_gateway_southward_devices_total`
- `ng_gateway_southward_data_points_total`

按通道聚合（labels：`channel_id, driver`）：

- `ng_gateway_southward_channel_connected{channel_id,driver}`：0/1
- `ng_gateway_southward_channel_state{channel_id,driver}`：状态枚举值（用于趋势/告警）
- `ng_gateway_southward_channel_reconnect_total{channel_id,driver}`
- `ng_gateway_southward_channel_connect_failed_total{channel_id,driver}`
- `ng_gateway_southward_channel_disconnect_total{channel_id,driver}`
- `ng_gateway_southward_channel_bytes_total{channel_id,driver,direction="in|out"}`
- `ng_gateway_southward_io_total{channel_id,driver,result="success|failed"}`：南向 I/O 结果累计
- `ng_gateway_southward_io_latency_seconds_bucket|sum|count{channel_id,driver,result="success|failed"}`
- `ng_gateway_southward_collect_cycle_seconds_bucket|sum|count{channel_id,driver,result="success|failed|timeout"}`
- `ng_gateway_southward_point_read_total{channel_id,driver,result="success|failed|timeout"}`
- `ng_gateway_southward_report_publish_total{channel_id,driver,result="success|failed|dropped"}`

#### (E) Control plane（写点/执行 Action）

labels：`channel_id, driver`

- `ng_gateway_control_write_requests_total{channel_id,driver,result="success|fail|timeout"}`
- `ng_gateway_control_write_queue_wait_seconds_bucket|sum|count{channel_id,driver}`
- `ng_gateway_control_write_execute_seconds_bucket|sum|count{channel_id,driver,result="..."}`
- `ng_gateway_control_execute_requests_total{channel_id,driver,result="success|fail|timeout"}`
- `ng_gateway_control_execute_seconds_bucket|sum|count{channel_id,driver,result="..."}`

#### (F) Northward（北向）

管理面（无 labels）：

- `ng_gateway_northward_apps_total`
- `ng_gateway_northward_apps_active`
- `ng_gateway_northward_events_received_total`
- `ng_gateway_northward_data_routed_total`
- `ng_gateway_northward_routing_errors_total`

按 App 聚合（labels：`app_id, plugin_id, direction, result`）：

- `ng_gateway_northward_app_connected{app_id,plugin_id}`：0/1
- `ng_gateway_northward_app_state{app_id,plugin_id}`：状态枚举值
- `ng_gateway_northward_app_reconnect_total{app_id,plugin_id}`
- `ng_gateway_northward_messages_total{app_id,plugin_id,direction="uplink|downlink",result="success|fail|dropped"}`
- `ng_gateway_northward_message_latency_seconds_bucket|sum|count{app_id,plugin_id,direction,result}`

### 3.3 推荐 PromQL

下面给出一些“典型、可解释、可落地”的查询思路（按需调整时间窗口与阈值）。

> 注意：队列深度/阻塞耗时非常依赖场景（点位数、采集周期、网络 RTT），阈值要结合压测与历史基线确定。

- **采集超时率（近 5 分钟）**

```promql
sum(rate(ng_gateway_collector_cycles_total{result="timeout"}[5m]))
/
sum(rate(ng_gateway_collector_cycles_total[5m]))
```

- **南向某通道超时（按 channel_id 聚合）**

```promql
sum by (channel_id) (rate(ng_gateway_southward_point_read_total{result="timeout"}[5m]))
```

- **北向 drops 速率（按 app_id 聚合）**

```promql
sum by (app_id) (
  rate(ng_gateway_northward_messages_total{direction="uplink",result="dropped"}[5m])
)
```

- **背压强度：队列阻塞时间 P95（近 5 分钟）**

```promql
histogram_quantile(
  0.95,
  sum by (le, queue) (rate(ng_gateway_queue_blocked_seconds_bucket[5m]))
)
```

---

## 4. UI 聚合指标
::: warning
实时概览，不替代 Prometheus
:::

`/api/ws/metrics` 设计目标是：在 UI 中提供 **低基数、可解释、可控成本** 的实时可视化，而不是把所有 Prometheus 指标“搬进浏览器”。

### 4.1 scope 与订阅语义

一个 WebSocket 连接可同时订阅多个 scope（UI 就是这么做的）：

- `global`：网关总览快照（Dashboard）
- `channel`：某个南向通道的聚合快照
- `device`：某通道下 **按设备** 的观测行列表（注意：这是“列表快照”，可能较大）
- `app`：某个北向 App 的聚合快照

客户端消息：

```json
{ "type": "subscribe", "scope": "global", "intervalMs": 1000, "requestId": "..." }
{ "type": "subscribe", "scope": "channel", "id": 1, "intervalMs": 1000, "requestId": "..." }
{ "type": "unsubscribe", "scope": "channel", "id": 1, "requestId": "..." }
{ "type": "ping", "ts": 1730000000000 }
```

服务端行为要点：

- **服务端 coalescing**：按 interval tick 输出，不会因内部变化频繁而无限推送
- **interval clamp**：服务端会把 `intervalMs` 限制到 \([200, 5000]\)ms
- **device scope**：为了简化前端逻辑，服务端会发送“全量 rows”（而不是增量 patch）

### 4.2 你在页面上看到的值从哪里来?

- Dashboard 的 `CPU/内存/磁盘/网络吞吐` 来自 `GatewayStatusSnapshot.systemInfo + metrics.*`（由 MetricsHub 统一生成）
- Channel Observability 的：
  - `TX/RX Bps`：由 `bytesSent/bytesReceived` 累计值在前端做差分得到
  - `avg latency`：来自 `averageResponseTime`（后端以 EWMA/last 构建）
  - `pointRead*`、`reportPublish*`：来自通道聚合计数器
  - per-device 行：来自 `DeviceStatsSnapshot`（WS `scope=device` 的 rows）
- App Observability 的：
  - `messagesSent/Dropped/Errors/Retries`：来自 app 聚合计数器
  - `avgLatencyMs`：来自 app 发送耗时 EWMA（snapshot state）

---

## 5. 设备实时快照

`/api/ws/monitor` 的目标是让你在现场排障时快速回答：“网关是否采集到最新值？”  
它以设备为单位订阅，并推送两类数据：

- `telemetry`
- `attributes`（client/shared/server）

### 5.1 合并/限速（为什么你不会被点位刷屏）

服务端会把同一设备在短窗口内的更新 **合并后再推送**（当前窗口为 200ms），避免“每点一帧”导致 UI 卡死。  
前端也会以 200ms 做 UI 触发节流，确保表格刷新成本可控。

> 这也意味着：Realtime Monitor 是“近实时”，不是示波器；它用于排障与验证，而不是做毫秒级对账。

---

## 6. 统一日志（Logs）：如何与 Metrics/Realtime 串起来

日志治理（全局级别 + per-channel/per-app TTL override + 落盘/轮转/下载/清理）是排障闭环的关键，详见：

- [`配置管理`](./configuration.md)

本页只强调和可观测性强相关的两点：

- **不要全局长期开 DEBUG/TRACE**：优先使用 **TTL override** 定点放大
- **先定位到 channel/app 再开日志**：可观测性链路的目标就是把范围缩小到 1 个对象

---

## 7. 推荐排障 SOP

### 7.1 “设备没数据/数据延迟大”

- **先看 Dashboard**：CPU/内存/磁盘是否异常，Collector 平均耗时是否升高
- **看队列背压**：`queue_depth` 是否持续抬升、`queue_blocked_seconds` 是否变大、`queue_dropped_total` 是否增长
- **进入目标通道 Observability**：
  - 采集模式：看 `collectPointTimeout`、`avg latency`、`reconnects`
  - 上报模式：看 `publishDropped`/`publishFail`、`lastReportAge`
- **进入 Realtime Monitor**：订阅该设备，看 telemetry/attributes 是否在变化
- **必要时：对该 channel 开 DEBUG（TTL=5min）并复现**：下载日志包归档

### 7.2 “采集正常但北向上云异常”

- **先用 Realtime Monitor** 验证设备 telemetry 是否在变化（排除南向问题）
- **再看 App Observability**：
  - drops/s、errors/s、avgLatencyMs 是否异常
  - `retries` 是否持续增长（通常意味着对端不稳定/鉴权问题）
- **必要时对该 App 开 DEBUG（TTL=5min）**，复现并下载日志

---

## 8. 常见误区

- **误区 1：把 per-device/per-point 指标塞进 Prometheus**  
  这会在真实规模下直接让 TSDB 崩溃。NG Gateway 的设计是：Prom 低基数，设备级走 monitor/ws 或专用诊断。

- **误区 2：看到 drops 就立刻把队列调大**  
  队列变大只是在“更晚地暴露问题”，并会占用更多内存。正确姿势是：先定位是谁慢（南向 I/O、北向对端、CPU 压力），再调参。

- **误区 3：全局 DEBUG/TRACE 当作常态**  
  会带来编码/IO/磁盘的不可控成本。请使用 per-channel/per-app 的 TTL override。

