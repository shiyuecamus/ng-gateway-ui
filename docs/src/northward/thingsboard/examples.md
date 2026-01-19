---
title: 'ThingsBoard 配置示例'
description: '可复制的 ThingsBoard App 配置示例：Token 连接、Provision 连接、基础通信参数。'
---

## 1. Token 连接（推荐）

```json
{
  "connection": {
    "mode": "token",
    "host": "tb.example.com",
    "port": 1883,
    "client_id": null,
    "access_token": "YOUR_ACCESS_TOKEN"
  },
  "communication": {
    "message_format": "json",
    "qos": 1,
    "retain_messages": false,
    "keep_alive": 60,
    "clean_session": false
  }
}
```

---

## 2. Provision（自动获取凭据）

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
  },
  "communication": {
    "message_format": "json",
    "qos": 1,
    "retain_messages": false,
    "keep_alive": 60,
    "clean_session": false
  }
}
```

