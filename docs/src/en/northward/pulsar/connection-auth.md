---
title: 'Pulsar Connection & Auth'
description: 'serviceUrl (pulsar:// / pulsar+ssl://) and Token authentication configuration; common pitfalls and troubleshooting methods.'
---

## 1. Connection Fields

Pulsar connection configuration is located at:

-   `config.connection`

| Field | Type | Description |
| :--- | :--- | :--- |
| `serviceUrl` | string | `pulsar://host:6650` or `pulsar+ssl://host:6651` |
| `auth` | object | Auth configuration (none/token) |

---

## 2. Authentication (Token)

```json
{
  "auth": {
    "mode": "token",
    "token": "YOUR_TOKEN"
  }
}
```

::: warning
Token is sensitive information. Recommend injecting via config management/secret management, do not write into public config repository.
:::

---

## 3. TLS (pulsar+ssl://)

When `serviceUrl` uses `pulsar+ssl://`, specific TLS certificate trust chain behavior is decided by Pulsar client and deployment method.
If you run gateway in container, please ensure:

-   Runtime environment can access correct CA (or system trust)
-   DNS/hostname matches certificate SAN

---

## 4. Common Issues

-   `serviceUrl` wrong (Protocol/Port mismatch)
-   Token no permission (Tenant/Namespace/Topic permission insufficient)
-   Using `pulsar+ssl://` but certificate chain untrusted (Handshake failure)
