---
title: 'Kafka 连接与安全'
description: 'bootstrap servers、client.id、PLAINTEXT/SSL/SASL_* 配置；TLS/SASL 字段说明与常见坑。'
---

## 1. 连接配置字段

Kafka 连接配置位于：

- `config.connection`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `bootstrapServers` | string | broker 列表（逗号分隔），例如 `kafka-1:9092,kafka-2:9092` |
| `clientId` | string \| null | 可选 client.id；为空则用 `ng-gateway-app-{app_id}` |
| `security.protocol` | enum | `plaintext` / `ssl` / `sasl_plaintext` / `sasl_ssl` |
| `security.tls.*` | object \| null | TLS 配置（仅 `ssl` / `sasl_ssl` 生效） |
| `security.sasl.*` | object \| null | SASL 配置（仅 `sasl_plaintext` / `sasl_ssl` 生效） |

---

## 2. TLS 配置（`security.tls`）

| 字段 | 类型 | 说明（对应 librdkafka `ssl.*`） |
| --- | --- | --- |
| `caLocation` | string \| null | CA bundle 路径（`ssl.ca.location`） |
| `certificateLocation` | string \| null | client cert 路径（`ssl.certificate.location`） |
| `keyLocation` | string \| null | private key 路径（`ssl.key.location`） |
| `keyPassword` | string \| null | 私钥密码（`ssl.key.password`） |
| `endpointIdentificationAlgorithm` | string \| null | hostname 校验算法（`ssl.endpoint.identification.algorithm`），常见为 `https` 或空字符串（关闭） |

::: warning 容器部署常见坑
证书路径必须是 **容器内路径**。  
你需要把证书通过 volume mount 到容器中，并在这里填写容器内路径。
:::

---

## 3. SASL 配置（`security.sasl`）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `mechanism` | enum | `plain` / `scram_sha256` / `scram_sha512` |
| `username` | string | SASL 用户名 |
| `password` | string | SASL 密码 |

---

## 4. 示例

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

