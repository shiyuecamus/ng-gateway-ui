---
title: 'ThingsBoard Configuration Examples'
description: 'Copyable ThingsBoard App configuration examples: Token connection, Provision connection, basic communication parameters.'
---

## 1. Token Connection (Recommended)

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
    "max_payload_bytes": 9216,
    "keep_alive": 60,
    "clean_session": false
  }
}
```

---

## 2. Provision (Auto Credential Acquisition)

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
    "max_payload_bytes": 9216,
    "keep_alive": 60,
    "clean_session": false
  }
}
```
