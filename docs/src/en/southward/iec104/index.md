---
title: 'IEC 60870-5-104'
description: 'IEC104 channels, full CA/IOA identity, protocol units, Direct/SBO control, read-only GI/CI and original-operation recovery.'
---

## 1. Runtime model and service boundary

IEC104 carries ASDUs over TCP, normally on port 2404. Each NG Gateway Channel owns one supervised TCP association and may contain multiple Devices/CAs. Received monitoring data enters Core and is forwarded according to northward configuration.

| Runtime entry | Current scope |
| --- | --- |
| Point monitoring | The 25 point-monitoring layouts declared in metadata, including status, step position, bitstrings, measurements and totals; matched by configured CA, TypeID and full IOA |
| WritePoint / Action input | Fourteen process-command layouts using Direct, or Select Before Operate for types with an SE field |
| Startup, periodic and operator read interrogation | GI current information and CI stored counter values, without counter freeze or reset |
| Other native monitoring, system, parameter, file and security layouts | Native recognition, raw facts or encoding do not enable a runtime service; there is no corresponding parameter-loading, file-transfer or authentication operation entry |

The native kernel also decodes/encodes seven protection-event and packed-status monitoring layouts without current driver point projection. Configure types exposed by current driver metadata. An undeclared TypeID in an Action input does not enable another protocol service.

Configuration admission rejects TypeIDs without a runtime entry and rolls back the change without advancing the configuration revision or replacing the live connection. Read-only points use the 25 monitoring types above. Writable points may still directly use the 14 process-command TypeIDs; Action inputs accept only those 14 commands. Previously stored unsupported native TypeIDs cannot activate after upgrade: correct the point/command type, then reactivate the channel.

Configured Device CA must be `1..65535`, and queue and pending-byte capacities must fit their separate native ranges (currently at least `1` item and `12` bytes). Previously stored `CA=0` or oversized capacities cannot activate after upgrade: correct them and reactivate the channel. Reconnecting does not make those values valid.

## 2. Configuration model

### 2.1 Channel

Connection fields are `host` and `port`, supporting IP literals and bounded ASCII hostnames. The smaller of `t0Ms` and the connection-policy establishment limit is shared by resolution and every TCP candidate; `t1Ms` bounds I/U link confirmations; `t2Ms` aggregates receive acknowledgments; `t3Ms` triggers idle link tests. See [link timers and backpressure](./link-timers.md) for `kWindow`, `wThreshold` and outbound queue/byte settings. Link acknowledgment and application confirmation are distinct outcomes.

Startup and periodic reads use these fields:

| Field | Default | Meaning |
| --- | --- | --- |
| `autoStartupGeneralInterrogation` | `true` | Start GI after association activation |
| `autoStartupCounterInterrogation` | `true` | Start read-only CI after activation |
| `interrogationQoi` | `20` | `20` for the station, `21..36` for information groups |
| `counterGroup` | `5` | `5` for all counters, `1..4` for groups; no FRZ input |
| `interrogationParallelism` | `4` | Concurrent startup/periodic reads, `1..64`, no larger than send queue capacity |
| `periodicGiIntervalSecs` | `600` | Periodic GI interval; `0` disables it |
| `periodicCiIntervalSecs` | `1800` | Periodic CI interval; `0` disables it |
| `dataSilenceTimeoutSecs` | `1800` | Request reconnection after prolonged absence of process information; `0` disables it |

The old `startupQoi` and `startupQcc` fields are not current configuration. QOI/counter-group values must remain valid even with automatic interrogation disabled. Link tests and S-ACKs are not process-information observations.

`sourceTime` explicitly selects unknown interpretation (`kind: unknown`), UTC (`kind: utc` and `century`), or fixed offsets (`kind: fixed`, `century`, `standardOffsetMinutes`, and `summerOffsetMinutes` when needed). Without an interpretation, raw time facts remain available without an inferred UTC instant. CP24 has no independent date/hour anchor. Downlink commands with CP56 require an explicit valid source-time interpretation.

Host presentation is limited to 1–254 ASCII bytes, including IPv6 brackets/zone or a final DNS root dot. DNS labels have at most 63 bytes and a hostname without its final root dot has at most 253 bytes. The form prefilters characters/length; the server validates exact address syntax before applying configuration.

One lookup admits at most 16 address candidates and explicitly refuses an oversized result. Candidate failure does not renew the deadline, and the successful stream retains the original meter. A system lookup still running after timeout/cancellation keeps its original work slot; retries cannot overlap it in the same connector, and shutdown joins actual completion.

### 2.2 Device and addresses

- Device `ca` has metadata range `1..65535`. Governed control and GI/CI require one responder and accept only unicast `1..65534`; `65535` is invalid for those requests.
- Point and Action input `ioa` uses the full 24-bit range `0..16777215` (`0xFFFFFF`), without 16-bit truncation.
- Multiple Devices/CAs may share one Channel. The configured CA, TypeID and IOA must match the field mapping. Different monitoring TypeIDs at the same IOA are matched separately.

### 2.3 Point and Action input

Point configuration uses `typeId`, `ioa` and `controlMode`. A supported monitoring TypeID maps to its corresponding process command for a point write. An explicitly configured command TypeID retains its command identity.

An Action groups operations. Each `inputs(Parameter)` supplies its own `driver_config.typeId`, `driver_config.ioa` and `driver_config.controlMode`; arbitrary Action JSON fields do not specify a target.

`controlMode` is `direct` (default) or `selectBeforeOperate`. It belongs to the Point/Action input, not automatic channel interrogation. Bitstring commands have no SE and reject Select Before Operate before sending.

## 3. Protocol values and types

| Monitoring type | Protocol value retained | Recommended DataType |
| --- | --- | --- |
| M*SP*\* | Boolean status with independent quality | Boolean |
| M*DP*\* | `0` intermediate, `1` OFF, `2` ON, `3` indeterminate | UInt8 |
| M*ST*\* | Signed `-64..63` with an independent transient flag | Int16 |
| M*BO*\* | Full unsigned 32-bit pattern | UInt32 |
| M_ME_NA/ND and corresponding timed forms | Normalized protocol units, `raw / 32768` | Float32 / Float64 |
| M_ME_NB and corresponding timed forms | Signed 16-bit scaled value | Int16 / Float64 |
| M_ME_NC and corresponding timed forms | IEEE754 short float | Float32 / Float64 |
| M*IT*\* | Signed 32-bit counter; independent SQ/CY/CA/IV | Int32 / Int64 |

Observe quality, Test, raw time validity and value separately. Do not coerce double-point states into Boolean, negative counters into unsigned values, or missing/invalid source time into a current valid observation. See [TypeID and point modeling](./typeid.md).

## 4. Process control

| Command without/with CP56 | Required protocol value | Recommended DataType |
| --- | --- | --- |
| C_SC_NA_1 / C_SC_TA_1 | Boolean or exact numeric `0/1` | Boolean |
| C_DC_NA_1 / C_DC_TA_1 | Exact `1` OFF / `2` ON | UInt8 |
| C_RC_NA_1 / C_RC_TA_1 | Exact `1` LOWER / `2` HIGHER | UInt8 |
| C_SE_NA_1 / C_SE_TA_1 | Finite normalized `[-1, 32767/32768]`, quantized on the `1/32768` grid | Float64 |
| C_SE_NB_1 / C_SE_TB_1 | Exact integer `-32768..32767` | Int16 |
| C_SE_NC_1 / C_SE_TC_1 | A number representable as a finite short float | Float32 / Float64 |
| C_BO_NA_1 / C_BO_TA_1 | Exact unsigned integer `0..4294967295` | UInt32 |

A normalized setpoint uses protocol units such as `0.5`, not raw count `16384`. Core applies the configured inverse transform once; the driver does not scale again. Fractions cannot become double/regulating commands by rounding. Boolean is valid only for single commands. Out-of-range, non-finite and invalid types are denied before sending.

Direct execution still requires the original durable operation grant. Select Before Operate applies to single/double/regulating and the three setpoint families, each with and without time. Positive selection does not authorize Operate; that phase requires another grant. An SBO batch cannot repeat a CA/IOA, and all selections complete before a mixed batch proceeds.

Enqueueing and link ACKs do not prove application acceptance. Execute ACT_CON is acceptance; correlated ACT_TERM is protocol completion. Protocol success does not prove the device reached its target state. Independently acquired status and quality are shown separately.

## 5. Read-only GI/CI

Open **IEC104 read interrogation** on the channel page, select a configured station, information kind and range, then request the read. Channel read permission and an available current association are required; station identity and configuration revision come from that channel.

GI uses station `20` or groups `21..36`; CI uses all `5` or groups `1..4`. The entry rejects freeze/reset, broadcast addresses and obsolete fields. Do not create a dummy Action/input to trigger GI/CI.

The receipt separates local write, application acceptance and correlated termination. Completion does not guarantee admission of all information into Core, an atomic snapshot, or a field-state change. Check receive time, value, quality and loss diagnostics in monitoring separately.

## 6. Cancellation, unknown results and recovery

Query the original operation ID in Action Debug/original-operation history, check its target, acknowledge its fingerprint and supply a reason before requesting cancellation. Cancellation stays on the original operation and deadline. HTTP acceptance of the intent does not prove remote selection release; correlated cancellation confirmation is required.

Timeout, link loss or incomplete confirmation may leave an unknown result or unreleased selection. The operation retains identity/evidence and is not resent automatically after reconnection or same-database restart. Repeating one business intent returns the original operation ID. Conflicting fresh intents for unresolved physical targets are denied. Late positive selection only adds original evidence and cannot reauthorize execution; a definitive late negative reply can resolve the original rejection. Reading back the same value alone does not prove this operation succeeded.
