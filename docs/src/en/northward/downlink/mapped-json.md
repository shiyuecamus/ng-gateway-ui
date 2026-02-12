---
title: 'Downlink MappedJson + Filter'
description: 'Map arbitrary JSON to WritePoint/Command/RpcResponseReceived; avoid mis-parsing in mixed topic scenarios via filter.'
---

## 1. Why Downlink Also Needs MappedJson

Platform side control plane messages are often "Not the shape you want", e.g.:

-   Platform puts `pointId` at top level
-   Value type is string (`"1" / "true"`)
-   Topic mixes multiple control messages

MappedJson allows you to map input JSON to gateway expected event structure, then hand over to core for unified validation and execution.

---

## 2. Configuration Shape

```json
{
  "mode": "mapped_json",
  "config": {
    "request_id": "requestId",
    "point_id": "pointId",
    "value": "value"
  },
  "filter": {
    "mode": "json_pointer",
    "pointer": "/eventType",
    "equals": "write_point"
  }
}
```

Explanation:

-   `config`: **Output Structure** (WritePoint/Command/RpcResponse) field path → JMESPath expression
-   `filter`: Executed during decode phase
    -   Mismatch → `Ok(None)` (Ignore, not error)
    -   Match but mapping failure/deserialization failure → Treated as error

---

## 3. Filter Mode

### 3.1 `none`

No filtering: All messages attempt to map by this route (Mixed topic will be noisy).

### 3.2 `json_pointer` (Recommended)

Extract discriminator using RFC6901 JSON Pointer:

-   pointer example: `/event/kind`, `/type`, `/eventType`
-   equals: String comparison (Numeric/bool will convert to string comparison)

### 3.3 `property`

Match using message metadata (Kafka header / Pulsar properties):

```json
{ "mode": "property", "key": "event_kind", "equals": "write_point" }
```

### 3.4 `key`

Match using message key (Kafka record key / Pulsar partition_key):

```json
{ "mode": "key", "equals": "write_point" }
```

---

## 4. Production Suggestion

-   **Control plane topics try not to mix** (One topic per kind)
-   If mixing is necessary:
    -   EnvelopeJson: Use `event.kind` routing (Most stable)
    -   MappedJson: Must add `filter`, otherwise there will be lots of "Mapping Failure Noise"
