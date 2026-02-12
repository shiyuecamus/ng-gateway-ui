---
title: 'Security & Certificates (PKI / trusted_client_certs)'
description: 'OPC UA Server endpoints, security modes, PKI directory structure, and how to add client certificates to trusted_client_certs.'
---

## 1. Endpoints

Current server exposes two endpoints simultaneously (Same path `/`):

-   `no_security`: SecurityPolicy=None, MessageSecurityMode=None
-   `basic256sha256_sign_encrypt`: SecurityPolicy=Basic256Sha256, MessageSecurityMode=SignAndEncrypt

::: warning Default Endpoint
Current implementation sets default endpoint to **no_security** (For easy first run).
Production environment strongly recommends client choosing `basic256sha256_sign_encrypt` and configuring certificate trust.
:::

---

## 2. PKI Directory

Server uses a stable PKI directory:

```text
./pki/plugin/{plugin_id}/
  trusted/
  own/
  private/
```

Where `{plugin_id}` is the App id (Used to isolate different instances).

::: tip
On first startup, server will automatically generate self-signed certificate if missing (create_sample_keypair=true), lowering entry barrier.
:::

---

## 3. trusted_client_certs (Whitelist Trust)

Configuration field:

-   `trustedClientCerts: string[]`

Each item supports two inputs:

1.  **PEM** (Contains `-----BEGIN CERTIFICATE-----` / `-----END CERTIFICATE-----`)
2.  **base64 DER** (No marker)

On startup, these certificates will be materialized to:

```text
./pki/plugin/{plugin_id}/trusted/
```

<!-- TODO screenshot: opcua-security-trust -->

---

## 4. Common Pitfalls

-   Certificate format wrong (PEM marker incomplete / base64 has weird chars)
-   Plugin not restarted after certificate update (trusted directory not refreshed)
-   Client connects to no_security endpoint but expects encryption (Need to select secure endpoint in client)
