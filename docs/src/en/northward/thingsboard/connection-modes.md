---
title: 'ThingsBoard Connection Modes & Parameters'
description: 'Field explanation, selection and notes for five connection modes: None/UsernamePassword/Token/X509/Provision.'
---

## 1. How to Choose Connection Mode

Recommended Order:

-   **Token**: Most common, simplest, suitable for most production scenarios
-   **Provision**: You want gateway to auto-register/acquire credentials (Large device volume, automated O&M)
-   **X509Certificate**: Scenarios with strong requirements for certificate system
-   **UsernamePassword/None**: Only for special scenarios or testing (Not recommended for production)

---

## 2. Configuration Structure

ThingsBoard configuration has two parts:

-   `connection`: Connection and Authentication (and Provision)
-   `communication`: MQTT Communication Parameters (QoS/retain/keepAlive/cleanSession/messageFormat)

---

## 3. ConnectionConfig

### 3.1 Token (Recommended)

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
Certificate path must be visible to runtime environment (Path inside container).
:::

### 3.4 Provision

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

`provision_method`:

-   `ACCESS_TOKEN`
-   `MQTT_BASIC`
-   `X509_CERTIFICATE`

Provision details see: [`Provision (Auto Registration/Credential Acquisition)`](/northward/thingsboard/provision)

---

## 4. CommunicationConfig (`communication`)

| Field | Default | Description |
| :--- | :--- | :--- |
| `message_format` | `json` | `json` / `protobuf` (Protobuf not implemented currently) |
| `qos` | 1 | 0/1/2 (Invalid value falls back to 1) |
| `retain_messages` | false | retain flag |
| `max_payload_bytes` | 9216 | Max payload bytes for single MQTT Publish (After JSON serialization). Exceeding limit will automatically "Fragment/Chunk" (Split into multiple legal messages conforming to TB Gateway API). See: [`max_payload_bytes and Chunking Algorithm`](/northward/thingsboard/max-payload-bytes-and-chunking) |
| `keep_alive` | 60 | keep alive seconds |
| `clean_session` | false | clean session |
