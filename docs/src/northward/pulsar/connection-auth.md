---
title: 'Pulsar 连接与鉴权'
description: 'serviceUrl（pulsar:// / pulsar+ssl://）与 Token 鉴权配置；常见坑与排查方法。'
---

## 1. 连接字段

Pulsar 连接配置位于：

- `config.connection`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `serviceUrl` | string | `pulsar://host:6650` 或 `pulsar+ssl://host:6651` |
| `auth` | object | 鉴权配置（none/token） |

---

## 2. 鉴权（Token）

```json
{
  "auth": {
    "mode": "token",
    "token": "YOUR_TOKEN"
  }
}
```

::: warning
Token 属于敏感信息。建议通过配置管理/密钥管理注入，不要写进可公开的配置仓库。
:::

---

## 3. TLS（pulsar+ssl://）

当 `serviceUrl` 使用 `pulsar+ssl://` 时，TLS 的具体证书信任链行为由 Pulsar client 与部署方式决定。  
如果你在容器中运行网关，请确保：

- 运行时环境能访问到正确的 CA（或系统信任）
- DNS/hostname 与证书 SAN 匹配

---

## 4. 常见问题

- `serviceUrl` 写错（协议/端口不匹配）
- token 无权限（tenant/namespace/topic 权限不足）
- 使用 `pulsar+ssl://` 但证书链不可信（握手失败）

