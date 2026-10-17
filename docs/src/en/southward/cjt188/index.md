---
title: 'CJT188'
description: 'Qualified plaintext collection, native record validation, and explicit capability boundaries.'
---

## Capabilities and configuration migration

The driver implements polling collection. Point writes, actions and physical control bindings are denied before any control packet is sent. The native kernel is `ng-proto-cjt188`; the driver owns metered TCP/serial I/O, supervision, cancellation and SDK projection.

This is a breaking configuration migration. Retired `version`, `connection.type`, `max_timeouts`, `wakeup_preamble` and `field_key` are rejected. Select an explicit `profile`: `standard2004` (plaintext, engineering DI `901F` sends `90 1F`), `standard2018` (DI1/DI0 identity, sends `1F 90`, encrypted replies rejected), or `yiduWaterV12` (documented optical water-meter V1.2, water `901F` only; reserved zero settlement/time fields remain unavailable).

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

Serial uses `kind="serial"`, `port`, `baudRate`, `dataBits`, `stopBits`, `parity`; standard rates 300/600/1200/2400/4800/9600 and 8E1 are required. Wakeup is empty or two to four FE octets; bus idle is 30..1000 ms. Source UTC offset is explicit, never inferred from the host. Without it numeric points retain unknown source time; calendar points require it.

Device configuration is `{ "meterType": 16, "address": "00000000000001" }`. The address is exactly fourteen decimal BCD digits. Valid type ranges are 10H..19H, 20H..29H, 30H..39H and 40H..49H. Reserved gaps never become a custom family. A 2018 all-99 address cannot be an addressed read destination.

Point configuration is `{ "di": "901F", "fieldKey": "current_flow" }`. Points and aliases sharing one DI share one complete read and its reception time. Unknown fields, unqualified identifiers, unit conflicts and financial type errors are rejected before sending.

## Native semantics

Records must have exact complete lengths, including unbound fields. Highest BCD nibble F indicates a negative value. Whole-field FF/EE markers include the unit and preserve unavailable/fault states without invented zero values. Raw two-byte ST retains vendor bits; connection success does not imply Good source quality.

Decimals retain integer mantissa and scale until SDK projection. Original and configured output units use rational conversion before one uplink Transform. Integer projection rejects fractional truncation. Fixed units are Celsius, kPa and hours. Price/money points require `String` and identity Transform, preserving exact decimal text.

SER increments modulo 256 within the exclusive communication owner. Original SER and full ST qualify exception replies. Queue, idle, write and read retain the original deadline. Every actual write/flush poll also checks cancellation and expiry. Dropped, cancelled, expired or contaminated active exchanges retire the connection; stale replies cannot enter a new exchange. Supervisor stop cancels and reclaims the actual I/O owner.

See [Address and DI](./address-di.md) for record families and unresolved qualification. D5 remains under validation; software evidence is distinct from actual meters, physical serial timing and normative conformance.
