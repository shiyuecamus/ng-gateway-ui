---
title: 'MappedJson (JMESPath Declarative Mapping)'
description: 'Map northward internal data to JSON desired by your platform: compile once, apply many; including input view, rule writing, performance and common pitfalls.'
---

## 1. When to use MappedJson

When you encounter the following situations, MappedJson is the most direct "Product-level" choice:

-   Platform field naming/hierarchy inconsistent with NG Gateway
-   Platform needs extra static fields (tenant, site, schemaVersion, etc.)
-   Want to rearrange some fields of `EnvelopeJson`/`Kv` into platform required shape

---

## 2. Configuration Shape

MappedJson configuration is a Map:

```json
{
  "out.path": "<jmespath expr>",
  "out2.path": "<jmespath expr>"
}
```

Where:

-   **key**: Output path (Segmented by `.`), e.g., `payload.data.device_id`
-   **value**: JMESPath expression, evaluate on "Input View JSON"

---

## 3. Input View

MappedJson input view is stable, shape as follows:

```json
{
  "schema_version": 1,
  "event_kind": "telemetry",
  "ts_ms": 1734870900000,
  "app": { "id": 1, "name": "my-app", "plugin_type": "kafka" },
  "device": { "id": 1001, "name": "dev-1", "type": null },
  "data": { }
}
```

Explanation:

-   `event_kind` comes from internal EnvelopeKind (Consistent with `event.kind` of `EnvelopeJson`)
-   `data` is JSON representation of `NorthwardData` (Telemetry/Attributes/...)

---

## 4. Example: Map Telemetry to Platform Expected Structure

Target Output:

```json
{
  "ts": 1734870900000,
  "device": "dev-1",
  "values": { "temp": 25.6 }
}
```

Example Configuration (Schematic only, specific data fields subject to actual Telemetry JSON):

```json
{
  "ts": "ts_ms",
  "device": "device.name",
  "values": "data.values"
}
```

::: warning
Internal structure of `data` depends on serde JSON shape of `NorthwardData`.
When implementing plugin documentation, I will give "Real Example Input" for Telemetry/Attributes, so users can write mapping rules directly.
:::

---

## 5. Performance and Stability Suggestions

-   **Keep rules few and stable**: More rules, higher CPU overhead; also harder to troubleshoot
-   **Output path as flat as possible**: Deep nesting increases write overhead and conflict probability
-   **Avoid relying on unstable fields**: e.g., relying on some temporary meta (May evolve later)

---

## 6. Common Pitfalls

-   **JMESPath expression wrong**: Will cause mapping compile failure or eval failure
-   **Output path conflict**: e.g., wrote `a=1` first, then `a.b=2` (Type conflict)

For more detailed syntax quick reference see: [`JMESPath Quick Reference`](/northward/payload/mapped-json-jmespath)
