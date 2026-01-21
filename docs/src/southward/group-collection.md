---
title: 'Group Collection（分组采集）设计与各驱动用法'
description: '解释什么是 group collection、为什么需要它、Collector 如何分组与并发、CollectionGroupKey 的设计细节，以及 Modbus/S7/MC/OPC UA/EtherNet-IP 等驱动如何使用。'
---

# Group Collection 设计与各驱动用法

Group Collection 是南向体系里专门为`高吞吐轮询采集`设计的一套机制，它的目标不是“让你少配几个设备”，而是：

- **在保持业务建模灵活**（可把同一物理设备拆成多个业务 Device）的前提下
- **最大化协议侧批量能力**（减少请求次数、减少会话/握手开销、减少调度开销）
- 并且保持**稳定的背压与超时语义**（组级别 timeout、并发上限、取消可控）

---

## 1. 你为什么需要 group collection

现场非常常见的一种建模方式是：

- 一条物理连接（一个 PLC/一个 OPC UA endpoint/一个 EtherNet-IP session/一个 Modbus slave）
- 但业务上为了组织/权限/资产模型，把点位拆成多个“业务设备”（多个 Device）

如果 driver 按“每个业务设备一次采集”去做：

- 协议请求次数暴增
- 连接复用变差（尤其是需要会话/认证/握手的协议）
- tokio task 调度开销暴增
- 背压/超时/重试粒度不稳定

因此我们引入 group collection：让 core 负责把设备按“物理采集语义”分组，driver 负责在组内做**批读/批写计划**，最后仍按业务 device 输出。

---

## 2. Collector 如何工作

### 2.1 输入：CollectItem

Collector 给 driver 的输入不是“点位列表”，而是一个 `CollectItem` 列表：

- 每个 `CollectItem` 表示一个**业务 Device**及其 Points：  
  `(RuntimeDevice, [RuntimePoint])`

### 2.2 分组：CollectionGroupKey

Collector 会对每个 device 调用 driver 提供的：

- `collection_group_key(device) -> Option<CollectionGroupKey>`

分组语义：

- 返回 `None`：该 device 不参与物理分组，Collector 保证它会被单独调用一次（`items.len()==1`）
- 返回 `Some(key)`：Collector 会把 key 相同的多个 device 合并为一次 `collect_data(items)` 调用

### 2.3 CollectionGroupKey 的设计

`CollectionGroupKey` 是一个固定大小、可 hash、无分配的 key：

- 总长度 16 bytes
- `[0..4)`：`kind` 命名空间（big-endian u32）
- `[4..16)`：协议自定义 payload（12 bytes）

这样设计的目的：

- **热路径友好**：可作为 `HashMap` key，避免 `String` 分配
- **跨驱动安全**：不同协议可以用不同 `kind`，避免碰撞
- **表达力足够**：payload 允许塞 `u64`、两个 `u48`、任意 12 bytes 或 hash 前缀

SDK 提供了构造函数（驱动开发可用）：

- `from_u64(kind, v)`
- `from_pair_u64(kind, a, b)`（截断到 48-bit，适合“两个 id”场景）
- `from_bytes(kind, payload12)`
- `from_hash128(kind, hash128)`

::: tip 经验法则：key 必须“稳定且表达物理会话语义”
key 的含义应当是“这些业务 device 可以共享一次物理批读/同一会话上下文”。  
例如 Modbus 用 slaveId；S7/OPC UA/MC/EtherNet-IP 多用 channelId（同一 channel 共享连接/会话）。
:::

### 2.4 执行：按 group 调用 driver.collect_data

Collector 会把每个组变成一次 driver 调用：

- 对每个 key 组：`driver.collect_data(items_in_group)`
- 对每个 None（单设备）：`driver.collect_data([single_item])`

并发与超时语义：

- **组级别 timeout**：一次 `collect_data(group)` 有一个统一的超时预算（不是“每个 device 一个超时”）
- **全局并发上限**：通过 semaphore + `buffer_unordered` 控制在飞组数量
- **可取消**：channel 被停用/网关关闭时，组采集会被取消

### 2.5 输出：必须按业务 device 输出

即使 driver 在一次 group 调用里合并采集了多个业务 device，**输出仍必须按业务 device 拆分**：

- `NorthwardData` 的 `device_id/device_name` 必须对应业务 device
- 推荐同一组使用同一个 `timestamp`（保证这一轮数据的一致性）

---

## 3. 使用场景与设计注意事项

### 3.1 什么时候应该分组

当且仅当满足：

- 这些业务 device **共享同一个物理会话语义**（共享连接/共享认证/共享序列化约束）
- 合并采集能显著减少协议开销（批读/批写）
- 合并不会引入“互相拖累”到不可接受（例如某个 device 极慢会让整组 timeout）

### 3.2 什么时候不要分组

例如：

- 每个业务 device 都必须独占连接（不同 IP/端口/串口）
- 协议层天然不支持 batch（或者 batch 反而不稳定）
- 合并会造成错误语义扩大（一个点非法导致整个 batch 失败，且设备容错差）

### 3.3 组太大怎么办（吞吐 vs 稳定）

组内合并的风险主要是：

- **timeout 放大**：组内任意慢点可能拖累整组
- **失败影响面扩大**：一次 batch 失败影响更多点
- **内存/CPU 峰值**：一次组采集要同时处理更多点位

建议：

- driver 在组内再做“子分批”（如 Modbus planner、EtherNet/IP chunk、OPC UA 分批读）
- 合理配置 Collector 的 `collection_timeout_ms` 与并发上限

### 3.4 key 的稳定性与碰撞

key 必须：

- **稳定**：不要用随机数、不要用重启会变化的临时值
- **表达物理语义**：不要仅用 `device_id`（那等于不分组）
- **避免碰撞**：
  - `kind` 用 ASCII 常量（例如 `"MODB"`/`"S7CH"`）
  - payload 用能唯一表示该物理会话的标识（slaveId/channelId/endpoint hash）
