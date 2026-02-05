---
title: 'Payload 上限（max_payload_bytes）与分片算法'
description: '如何设置 communication.max_payload_bytes；以及 ng-gateway 在 ThingsBoard Gateway API 上行时的“分片/分块”算法、边界条件、最佳实践与排障。'
---

## 1. 背景

在 ThingsBoard（TB）对接中，MQTT broker / TB 部署经常对单条消息大小设置硬上限（例如 10KB、64KB、128KB 等，取决于你的集群与网关配置）。如果网关发送超过上限的 Publish，常见后果是：

- broker 直接拒绝/断开连接（表现为网关北向频繁重连）
- 客户端库（本项目使用 `rumqttc`）在发送阶段报错，导致会话进入错误状态
- 消息被丢弃或无法被 TB 正常解析（取决于 broker/代理层）

因此，**必须在网关侧提前做硬限制**，把一批点位拆成多条 **合法且可被 TB 接收的消息**，从而保证会话稳定性与吞吐。

---

## 2. 配置项定义与默认值

ThingsBoard 插件配置位于 `communication.max_payload_bytes`：

- **语义**：单条 MQTT Publish 的 **payload 字节数上限**（对 JSON 序列化后的实际 bytes 生效）
- **默认值**：`9216`（9 KiB，给常见 10 KiB broker 上限预留 headroom）
- **下限保护**：过小会被提升到最小值（实现侧会保证不小于 256），避免极端配置导致死循环/不可用

示例：

```json
{
  "communication": {
    "message_format": "json",
    "qos": 1,
    "retain_messages": false,
    "max_payload_bytes": 9216,
    "keep_alive": 60,
    "clean_session": false
  }
}
```

:::: tip 推荐配置
- 如果你不确定 broker 的限制，**优先保持默认 9216**。
- 如果你的 broker 明确允许更大消息，可以增大到 32KiB/64KiB；但请同时评估 TB 侧解析压力与网络抖动风险。
::::

---

## 3. “分片”准确含义

这里的“分片/分片算法”指的是 **应用层分块**：

- 插件把一次上报的点位集合拆成多条 **独立的、完整的、符合 TB Gateway API 的 JSON 消息**
- 每条消息都可以被 TB 单独处理
- **不会**产生“需要服务端重组”的碎片，也不依赖 TB 做 re-assemble

:::: warning 不要混淆
这不是 MQTT 协议层分片（MQTT 不提供跨消息的自动重组语义）。这里的策略更类似 “batch → multiple publishes”。
::::

---

## 4. 分块算法

当前实现对 **Telemetry** 与 **Attributes** 都使用“按条目累积 → 超限刷出”的分块策略。

### 4.1 Telemetry 分块（`v1/gateway/telemetry`）

目标 payload 形状（每个 chunk 都严格遵守）：

```json
{
  "Device-A": [
    {
      "ts": 1734870900000,
      "values": {
        "k1": 1,
        "k2": true
      }
    }
  ]
}
```

算法要点：

- **累积单位**：`values` 内的每个 `point_key -> value`
- **大小计算**：基于 JSON 序列化后的真实 bytes（包含字符串转义、数字文本长度等）
- **刷出策略**：如果追加下一个条目会导致 \(`payload_bytes + next_entry_bytes + suffix_bytes > max_payload_bytes`\)，则：
  - 先把当前 chunk 补齐 JSON suffix 并输出（publish）
  - 再从同一个 prefix 重新开始构建新的 chunk

边界行为：

- 如果 **单个条目**（一个 `key:value`）本身就无法放入任何 chunk（即它的 bytes 超过上限），该条目会被跳过（best-effort），以保护会话稳定性。

### 4.2 Attributes 分块（`v1/gateway/attributes`）

目标 payload 形状（每个 chunk 都严格遵守）：

```json
{
  "Device-A": {
    "serial": "A10086",
    "fw": "1.0.0"
  }
}
```

算法与 Telemetry 相同，只是 prefix/suffix 不同。

边界行为：

- 若单个属性条目过大（无法放进一个 chunk），会被直接丢弃，并产生 warn 日志（便于排障）。

---

## 5. 如何选择 `max_payload_bytes`（最佳实践）

### 5.1 经验法则

- **默认值优先**：从 `9216` 开始（9 KiB）
- **预留 headroom**：即使 broker 标称 10 KiB，也建议留至少 5%~15% 的余量
- **大字段谨慎**：长字符串、JSON 数组、带大量小数位的浮点数，会显著放大 bytes
- **点位命名要短**：`point_key` 是 JSON key，会重复出现；短 key 对吞吐非常关键

### 5.2 什么时候需要增大

- broker/TB 明确允许更大消息
- 你希望减少 publish 次数（更大 chunk → 更少 publish）
- 网络稳定、TB 解析资源充足（CPU/内存有余量）

### 5.3 什么时候不应该增大

- 边缘网络抖动明显：更大消息更容易丢包/重传成本更高
- TB 集群解析压力大：单条大 JSON 的解析耗时更显著
- 你已经观察到 “单条消息延迟大于你期望”

---

## 6. 可观测性与排障

### 6.1 常见症状与原因

- **网关北向频繁重连**：常见原因是 broker 拒绝超限 publish；检查 `max_payload_bytes` 是否过大、或是否存在超大单点 value。
- **TB 上少量点位缺失**：可能是单个条目超大导致被丢弃；优先检查是否有异常长字符串/数组。

### 6.2 建议的排障动作

- 把 `communication.max_payload_bytes` 先下调到保守值（例如 9216），观察连接稳定性是否改善
- 检查点位数据类型与异常值（尤其长字符串、数组）
- 缩短 `point_key`（高频点位建议使用短 key，并在平台侧做映射展示）

---

## 7. FAQ

### 7.1 TB 会把多条 chunk 自动合并吗？

不会。TB 会把每条 chunk 当作独立的 telemetry/attributes 消息处理。插件的策略是保证每条消息 **自洽且可独立消费**。

### 7.2 这会影响时序语义吗？

Telemetry chunking 会让同一批点位分成多条消息，但它们共享同一个 `ts`（同批次同时间戳），平台侧时序仍然一致。

