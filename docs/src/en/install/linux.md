---
title: Linux Installation
description: 'Install and operate NG Gateway on Linux: deb/rpm + systemd (Recommended) and source build (Developer).'
---

# Linux Installation

## 1. Download / Install

### 1.1 Download

Please download the `.deb` / `.rpm` matching your distribution and architecture from the [Release Page](https://github.com/shiyuecamus/ng-gateway/releases):

::: tip
If you are unsure of the target machine architecture, you can use `uname -m` (e.g., `x86_64` / `aarch64`) to quickly confirm.
:::

### 1.2 Install

::: warning Note
Package management commands vary slightly across distributions; package filenames are subject to actual release.
:::

**Debian/Ubuntu (.deb)**:

```bash
sudo dpkg -i ./ng-gateway_*.deb
```

If prompted for missing dependencies, execute:

```bash
sudo apt-get -f install -y
```

**RHEL/CentOS/Fedora (.rpm)**:

```bash
sudo rpm -ivh ./ng-gateway-*.rpm
```

Or use the distribution's recommended package manager:

```bash
sudo dnf install -y ./ng-gateway-*.rpm
```

### 1.3 Start and Enable on Boot

```bash
sudo systemctl enable --now ng-gateway
sudo systemctl status ng-gateway --no-pager
```

## 2. Upgrade / Uninstall

### 2.1 Upgrade

Upgrading is usually just installing the new package (deb/rpm will overwrite files in the installation area), then restarting the service:

```bash
sudo systemctl restart ng-gateway
```

### 2.2 Uninstall

```bash
# Debian/Ubuntu
sudo dpkg -r ng-gateway

# RHEL/CentOS/Fedora
sudo rpm -e ng-gateway
```

> Note: Uninstalling the package generally does not automatically delete data under `/var/lib/ng-gateway/` to avoid accidental deletion of production data.

::: warning Complete Uninstallation
Linux package installation follows the best practice of "uninstalling the program does not automatically delete the data directory". Therefore, if you confirm that you want to clean up the runtime directory and data, please manually execute the following steps.

```bash
# 1) Stop and disable the service (if you no longer need it)
sudo systemctl stop ng-gateway || true
sudo systemctl disable ng-gateway || true

# 2) Uninstall the program itself (Choose one according to your distribution)
# Debian/Ubuntu
sudo dpkg -r ng-gateway

# RHEL/CentOS/Fedora
sudo rpm -e ng-gateway

# 3) Delete the runtime directory (will delete SQLite DB, certificates, drivers/plugins, runtime generated files, etc.)
sudo rm -rf /var/lib/ng-gateway

```
:::

## 3. Runtime Directories

::: tip
Linux packaging follows the standard layout of "Read-only Installation Area + Independent Configuration + Independent Writable Runtime Directory".
:::

-   **Installation Area**: `/opt/ng-gateway/`
    -   `bin/ng-gateway-bin`
    -   `drivers/builtin/*.so`
    -   `plugins/builtin/*.so`
-   **Configuration File**: `/etc/ng-gateway/gateway.toml`
-   **Runtime Directory (WorkingDirectory)**: `/var/lib/ng-gateway/`
    -   `data/ng-gateway.db` (Automatically created and migrated by SQLite on first startup)
    -   `drivers/`, `plugins/`, `certs/`, `pki/`, etc.

Default ports and access conventions (subject to `gateway.toml` included in the Linux distribution package):

-   **HTTP**: `8978`
-   **HTTPS**: `8979`
-   **API Prefix**: `/api`
-   **UI Mode**: `embedded_zip`

::: tip Why must there be a stable WorkingDirectory?
The gateway writes the paths of driver/plugin as "relative paths to the runtime root directory" into SQLite (e.g., `./drivers/builtin/libng_driver_modbus.so`).
Therefore, the systemd unit fixes `WorkingDirectory=/var/lib/ng-gateway` to ensure paths are available long-term and easy to migrate and backup.
:::

## 4. Modify Configuration

After modifying `/etc/ng-gateway/gateway.toml`, restart the service to make the configuration take effect:

```bash
sudo systemctl restart ng-gateway
```

## 5. View Logs

View real-time logs:

```bash
sudo journalctl -u ng-gateway -f
```

View the last 200 lines:

```bash
sudo journalctl -u ng-gateway -n 200 --no-pager
```

## 6. Health Check

Health Check:

```bash
curl -fsS "http://127.0.0.1:8978/health" && echo
```

## 7. Default Access Address

-   **UI**: `http://<host-ip>:8978/`
-   **API**: `http://<host-ip>:8978/api`

::: tip
-   Default Account: system_admin
-   Default Password: system_admin
:::
