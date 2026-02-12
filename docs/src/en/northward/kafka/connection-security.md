---
title: 'Kafka Connection & Security'
description: 'bootstrap servers, client.id, PLAINTEXT/SSL/SASL_* configuration; TLS/SASL field explanation and common pitfalls.'
---

## 1. Connection Configuration Fields

Kafka connection configuration is located at:

-   `config.connection`

| Field | Type | Description |
| :--- | :--- | :--- |
| `bootstrapServers` | string | Broker list (comma separated), e.g., `kafka-1:9092,kafka-2:9092` |
| `clientId` | string \| null | Optional client.id; defaults to `ng-gateway-app-{app_id}` if empty |
| `security.protocol` | enum | `plaintext` / `ssl` / `sasl_plaintext` / `sasl_ssl` |
| `security.tls.*` | object \| null | TLS configuration (Effective only for `ssl` / `sasl_ssl`) |
| `security.sasl.*` | object \| null | SASL configuration (Effective only for `sasl_plaintext` / `sasl_ssl`) |

---

## 2. TLS Configuration (`security.tls`)

| Field | Type | Description (Corresponds to librdkafka `ssl.*`) |
| :--- | :--- | :--- |
| `caLocation` | string \| null | CA bundle path (`ssl.ca.location`) |
| `certificateLocation` | string \| null | Client cert path (`ssl.certificate.location`) |
| `keyLocation` | string \| null | Private key path (`ssl.key.location`) |
| `keyPassword` | string \| null | Private key password (`ssl.key.password`) |
| `endpointIdentificationAlgorithm` | string \| null | Hostname verification algorithm (`ssl.endpoint.identification.algorithm`), commonly `https` or empty string (disabled) |

::: warning Container Deployment Common Pitfall
Certificate path must be **path inside container**.
You need to mount certificates into the container via volume mount, and fill in the container internal path here.
:::

---

## 3. SASL Configuration (`security.sasl`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `mechanism` | enum | `plain` / `scram_sha256` / `scram_sha512` |
| `username` | string | SASL username |
| `password` | string | SASL password |

---

## 4. Examples

### 4.1 PLAINTEXT

```json
{
  "connection": {
    "bootstrapServers": "127.0.0.1:9092",
    "security": { "protocol": "plaintext" }
  }
}
```

### 4.2 SASL_SSL + SCRAM-SHA-512

```json
{
  "connection": {
    "bootstrapServers": "kafka-1:9093",
    "security": {
      "protocol": "sasl_ssl",
      "tls": {
        "caLocation": "/certs/ca.pem",
        "endpointIdentificationAlgorithm": "https"
      },
      "sasl": {
        "mechanism": "scram_sha512",
        "username": "user",
        "password": "pass"
      }
    }
  }
}
```
