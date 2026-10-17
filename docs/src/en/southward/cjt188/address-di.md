---
title: 'CJT188 Address and DI'
---

## Native identities

`address` contains fourteen decimal BCD digits, A6..A0 in configuration and A0..A6 on the wire. AA broadcast/wildcard routes and 2018 all-99 broadcast are not admitted for addressed reads. `meterType` retains its native value in the four explicit ranges 10H..19H, 20H..29H, 30H..39H, 40H..49H. `di` has four hexadecimal digits; `fieldKey` must belong to its qualified complete record.

## Complete records

Payload widths exclude DI (two octets) and SER (one octet).

| Profile/family | DI | Payload | Fields |
| --- | --- | --- | --- |
| Standard profiles, water/gas/other | 901F | 19 | current_flow, settlement_flow, datetime, status |
| Standard profiles, heat/cooling | 901F | 43 | settlement_heat, current_heat, heat_power, flow_rate, cumulative_flow, supply_temp, return_temp, working_hours, datetime, status |
| 2018, water/gas/other | 911F | 33 | current_flow, settlement_flow, flow_rate, temperature, pressure, working_hours, datetime, status |
| 2018, heat/cooling | 911F | 59 | settlement_heat, settlement_cooling, current_heat, current_cooling, heat_power, flow_rate, cumulative_flow, supply_temp, return_temp, supply_pressure, return_pressure, working_hours, datetime, status |
| Standard profiles | D120..D12B | 5 | settlement_flow (water/gas/other), settlement_heat (heat) |
| 2018, water/gas/other | D200..D2FF | 5 | settlement_flow |
| 2018, heat | D200..D2FF | 15 | settlement_heat, settlement_cooling, settlement_flow |
| 2018, water/gas/other | D400..D4FF | 23 | freeze_datetime, cumulative_flow, flow_rate, temperature, pressure |
| 2018, heat | D300..D4FF | 44 | freeze_datetime, frozen_heat, frozen_cooling, heat_power, flow_rate, cumulative_flow, supply_temp, return_temp, supply_pressure, return_pressure |
| Standard profiles | 8102 | 15 | price_1, volume_1, price_2, volume_2, price_3 |
| Standard profiles | 8103 / 8104 | 1 | settlement_day / reading_day |
| Standard profiles | 8105 | 15 | purchase_seq, this_purchase, total_purchase, remaining_amount, status |

Yidu V1.2 admits water 901F only; reserved zero settlement/time fields are unavailable. Legacy 907F has no qualification in the inspected original service tables and is rejected.

The original 2018 water/gas/other D3XX row declares 14H but its complete field list and format table require 1AH. This service is explicitly denied until an original erratum or device-specific protocol qualifies it; fields are never guessed or truncated.

Use Float64 for numeric points, UInt16 for raw ST, and Timestamp with explicit sourceUtcOffsetMinutes for calendar points. Price and money require exact String projection and identity Transform. Retired configuration names and compatibility namespaces are not accepted.
