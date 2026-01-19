---
title: 'ThingsBoard 连接模式与参数'
description: 'None/UsernamePassword/Token/X509/Provision 五种连接模式的字段说明、如何选择与注意事项。'
---

## 1. 如何选择连接模式

推荐顺序：

- **Token**：最常见、最简单，适合绝大多数生产场景
- **Provision**：你希望网关自动注册/获取凭据（设备量大、自动化运维）
- **X509Certificate**：对证书体系有强要求的场景
- **UsernamePassword/None**：仅用于特殊场景或测试（不推荐生产）

---

## 2. 配置结构

ThingsBoard 配置分两块：

- `connection`：连接与鉴权（以及 Provision）
- `communication`：MQTT 通信参数（QoS/retain/keepAlive/cleanSession/messageFormat）

---

## 3. ConnectionConfig（`connection`）

### 3.1 Token（推荐）

```json
{
  "connection": {
    "mode": "token",
    "host": "tb.example.com",
    "port": 1883,
    "client_id": null,
    "access_token": "YOUR_ACCESS_TOKEN"
  }
}
```

### 3.2 UsernamePassword

```json
{
  "connection": {
    "mode": "username_password",
    "host": "tb.example.com",
    "port": 1883,
    "client_id": null,
    "username": "user",
    "password": "pass"
  }
}
```

### 3.3 X509Certificate

```json
{
  "connection": {
    "mode": "x509_certificate",
    "host": "tb.example.com",
    "tls_port": 8883,
    "client_id": null,
    "cert_path": "/certs/client.pem",
    "private_key_path": "/certs/client.key"
  }
}
```

::: warning
证书路径必须是运行环境可见路径（容器内路径）。
:::

### 3.4 Provision（自动获取凭据）

```json
{
  "connection": {
    "mode": "provision",
    "host": "tb.example.com",
    "port": 1883,
    "tls_port": 8883,
    "timeout_ms": 60000,
    "max_retries": 10,
    "retry_delay_ms": 2000,
    "provision_device_key": "YOUR_DEVICE_KEY",
    "provision_device_secret": "YOUR_DEVICE_SECRET",
    "provision_method": "ACCESS_TOKEN"
  }
}
```

`provision_method`：

- `ACCESS_TOKEN`
- `MQTT_BASIC`
- `X509_CERTIFICATE`

Provision 详解见：[`Provision（自动注册/凭据获取）`](/northward/thingsboard/provision)

---

## 4. CommunicationConfig（`communication`）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `message_format` | `json` | `json` / `protobuf`（当前 protobuf 未实现） |
| `qos` | 1 | 0/1/2（非法值会回退到 1） |
| `retain_messages` | false | retain 标志 |
| `keep_alive` | 60 | keep alive 秒 |
| `clean_session` | false | clean session |

