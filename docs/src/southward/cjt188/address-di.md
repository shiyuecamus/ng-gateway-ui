---
title: 'CJT188 地址与 DI'
---

## 地址与原生标识

`address` 为 14 位十进制数字（A6..A0）；线路按 A0..A6 发送。字节必须符合 BCD。读取不支持 AA 广播/通配地址；2018 全 99 是特殊广播地址，不能作为主动读取目标。

`meterType` 为完整原生类型，范围为 10H～19H（水）、20H～29H（热/冷）、30H～39H（燃气）、40H～49H（其他）。`di` 必须是四位 hexadecimal，`fieldKey` 必须来自明确选择的完整记录。

## 原生记录矩阵

以下长度均为 payload，排除两字节 DI 与一字节 SER。

| profile / 族 | DI | payload 字节 | fieldKey |
| --- | --- | --- | --- |
| 标准配置，水/气/其他 | 901F | 19 | current_flow, settlement_flow, datetime, status |
| 标准配置，热/冷 | 901F | 43 | settlement_heat, current_heat, heat_power, flow_rate, cumulative_flow, supply_temp, return_temp, working_hours, datetime, status |
| 2018，水/气/其他 | 911F | 33 | current_flow, settlement_flow, flow_rate, temperature, pressure, working_hours, datetime, status |
| 2018，热/冷 | 911F | 59 | settlement_heat, settlement_cooling, current_heat, current_cooling, heat_power, flow_rate, cumulative_flow, supply_temp, return_temp, supply_pressure, return_pressure, working_hours, datetime, status |
| 标准配置，水/气/其他 | D120..D12B | 5 | settlement_flow |
| 标准配置，热/冷 | D120..D12B | 5 | settlement_heat |
| 2018，水/气/其他 | D200..D2FF | 5 | settlement_flow |
| 2018，热/冷 | D200..D2FF | 15 | settlement_heat, settlement_cooling, settlement_flow |
| 2018，水/气/其他 | D400..D4FF | 23 | freeze_datetime, cumulative_flow, flow_rate, temperature, pressure |
| 2018，热/冷 | D300..D4FF | 44 | freeze_datetime, frozen_heat, frozen_cooling, heat_power, flow_rate, cumulative_flow, supply_temp, return_temp, supply_pressure, return_pressure |
| 标准配置 | 8102 | 15 | price_1, volume_1, price_2, volume_2, price_3 |
| 标准配置 | 8103 / 8104 | 1 | settlement_day / reading_day |
| 标准配置 | 8105 | 15 | purchase_seq, this_purchase, total_purchase, remaining_amount, status |

`yiduWaterV12` 仅接受水表 `901F`，其零保留时间和结算量不作为有效测量。旧 `907F` 未在已核对原始服务表中得到资格化，因此明确拒绝。

2018 原表水/气/其他 `D3XX` 的长度列 `14H` 与所列字段和数据格式表计算所得 `1AH` 相互矛盾；当前明确拒绝该服务，等待原始勘误或设备专属协议资格化，不猜测长度或截断字段。

数值测点推荐 `Float64`；ST 推荐 `UInt16`。时间字段要求 `Timestamp` 和显式 `sourceUtcOffsetMinutes`。价格/金额必须为 `String`，保留精确十进制文本。新配置不接受旧字段名或兼容命名空间。
