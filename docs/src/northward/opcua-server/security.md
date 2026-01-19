---
title: '安全与证书（PKI / trusted_client_certs）'
description: 'OPC UA Server 的 endpoints、安全模式、PKI 目录结构，以及如何把客户端证书加入 trusted_client_certs。'
---

## 1. Endpoints（实现对齐）

当前 server 同时暴露两个 endpoint（同一路径 `/`）：

- `no_security`：SecurityPolicy=None, MessageSecurityMode=None
- `basic256sha256_sign_encrypt`：SecurityPolicy=Basic256Sha256, MessageSecurityMode=SignAndEncrypt

::: warning 默认 endpoint
当前实现把默认 endpoint 设置为 **no_security**（便于首次跑通）。  
生产环境强烈建议客户端选择 `basic256sha256_sign_encrypt` 并配置证书信任。
:::

---

## 2. PKI 目录（实现对齐）

server 使用一个稳定的 PKI 目录：

```text
./pki/plugin/{plugin_id}/
  trusted/
  own/
  private/
```

其中 `{plugin_id}` 是该 App 的 id（用于隔离不同实例）。

::: tip
首次启动时，server 会在缺少证书时自动生成自签名证书（create_sample_keypair=true），降低首次使用门槛。
:::

---

## 3. trusted_client_certs（白名单信任）

配置字段：

- `trustedClientCerts: string[]`

每个条目支持两种输入：

1. **PEM**（包含 `-----BEGIN CERTIFICATE-----` / `-----END CERTIFICATE-----`）
2. **base64 DER**（无 marker）

启动时会把这些证书 materialize 到：

```text
./pki/plugin/{plugin_id}/trusted/
```

<!-- TODO screenshot: opcua-security-trust -->

---

## 4. 常见坑

- 证书贴错格式（PEM marker 不完整 / base64 带了奇怪字符）
- 证书更新后没重启插件（trusted 目录不会刷新）
- client 连接到 no_security endpoint 但期望加密（需在客户端选择 secure endpoint）

