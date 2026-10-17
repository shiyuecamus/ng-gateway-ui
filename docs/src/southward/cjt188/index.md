---
title: 'CJT188'
description: 'CJ/T188 明文采集配置、原生记录校验与业务能力边界。'
---

## 能力与配置迁移

驱动只提供主动采集。`write_point`、Action 和物理控制绑定均明确拒绝，不发送控制报文。协议内核为 `ng-proto-cjt188`；串口/TCP、监督试次和 SDK 投影由驱动持有。

本次为破坏式配置迁移。旧 `version`、`connection.type`、`max_timeouts`、`wakeup_preamble`、`field_key` 不再接受。通道必须明确选择 `profile`：

| profile | DI 线序与数据含义 |
| --- | --- |
| `standard2004` | 2004 明文记录配置，工程 DI `901F` 发送 `90 1F`；不实现加密服务。 |
| `standard2018` | 原表 DI1/DI0 标识，工程 DI `901F` 发送 `1F 90`；拒绝密文响应。 |
| `yiduWaterV12` | 益都光电直读水表 V1.2，仅水表 `901F`；结算量和时间按该厂商保留零模式表示不可用。 |

```json
{
  "profile": "standard2018",
  "connection": { "kind": "tcp", "host": "127.0.0.1", "port": 5001 },
  "wakeupPreamble": [254, 254, 254, 254],
  "idleMs": 30,
  "maxPendingRequests": 32,
  "maxNoiseBytes": 1024,
  "sourceUtcOffsetMinutes": 480
}
```

串口使用 `connection.kind="serial"`，字段为 `port`、`baudRate`、`dataBits`、`stopBits`、`parity`。要求标准波特率 300/600/1200/2400/4800/9600 和 8E1。唤醒码为空或 2～4 个 FE；线路空闲间隔 30～1000 ms。UTC 偏移为显式表具配置，不从宿主时区推断；不配置时数值采集保留未知源时间，时间测点需显式配置偏移。

设备配置为 `{ "meterType": 16, "address": "00000000000001" }`。地址必须是 14 位十进制 BCD 数字。表类型只接受 10H～19H、20H～29H、30H～39H、40H～49H；不把中间保留类型归入自定义族。2018 全 99 地址不允许用于主动读。

测点配置为 `{ "di": "901F", "fieldKey": "current_flow" }`。同一设备相同 DI 的测点与别名共享一次读取、完整校验和同一接收时间。未知字段、未资格化 DI、单位冲突和金额类型错误在发送前拒绝。

## 数据与生命周期语义

完整记录长度必须精确匹配；未绑定的字段也必须有效。BCD 负数使用最高 F 半字节；FF/EE 全字段（包括单位）分别表示不可用/故障，不伪造零值。ST 保留两字节及厂商位，不把连接成功映射为源质量 Good。

数值在内核保留整数 mantissa 和十进制位数。驱动按原始单位和配置输出单位做有理数换算，再执行一次 uplink Transform；整数投影拒绝小数截断。温度为 ℃，压力为 kPa，工时为 h。金额和价格必须用 `String` 与 identity Transform，输出精确十进制文本。

每次实际通信在独占总线内产生 modulo-256 SER，正常与异常响应均校验原始 SER。异常保留完整 ST。排队、线路空闲、发送和接收共用原期限；实际写入/flush 的每次 poll 也校验期限与取消。活跃交换被丢弃、取消、超时或污染时退出原连接，禁止旧响应进入下一交换；监督停止取消并收回实际 I/O owner。

完整 DI 表及仍需资格化的项目见 [地址与 DI](./address-di.md)。软件证据与真实仪表、串口物理时序及标准符合性证明分别记录；当前 D5 尚未完成全部验收。
