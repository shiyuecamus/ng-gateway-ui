---
title: 'Provision (Auto Registration/Credential Acquisition)'
description: 'ThingsBoard Provision working principle, TB side config points, retry semantics, credential persistence location and troubleshooting.'
---

## 1. What Problem Does Provision Solve

When you don't want to manually configure token/account on gateway side, but want gateway to "Automatically acquire credentials after startup", you can use Provision.

The plugin will:

1.  Connect to TB's provision MQTT broker (Usually same host/port)
2.  Subscribe to `/provision/response`
3.  Publish `/provision/request`
4.  Wait for response and extract credentials
5.  Persist credentials to extension storage (Reuse next time)

---

## 2. What You Need to Prepare on ThingsBoard Side

You need to configure Device Profile in TB to get:

-   `provision_device_key`
-   `provision_device_secret`

![Tb provision](./assets/provision.png)

::: tip Source of device_name
In current implementation, `device_name` of ProvisionRequest uses **App Name** (app_name).
Therefore suggest: Name App as the gateway name you expect to appear in TB (Stable, Operable).
:::

---

## 3. Retry and Timeout Semantics

Provision configuration fields:

-   `timeout_ms`: Total timeout for **Entire provision process**
-   `max_retries`: Max retry attempts
    -   `0` means infinite retry (Until total timeout exhausted)
    -   `1` means try only once (Return immediately on failure)
-   `retry_delay_ms`: Retry interval

::: warning
Even if `max_retries=0`, it is constrained by `timeout_ms`, timeout will return Timeout.
:::

---

## 4. Common Troubleshooting

-   **Always Timeout**: Check if TB enabled provision, port reachable, ACL/Firewall
-   **NotFound/Failure**: device key/secret mismatch, or device with same name already exists in TB
-   **Certificate Mode Failure**: Confirm certificate field format returned by TB (certificate/privateKey) matches gateway parsing
