---
title: macOS Installation
description: 'Install and operate NG Gateway on macOS: Homebrew installation, upgrade, uninstall, runtime directories & configuration, logs, health checks, and default accounts.'
---

# macOS Installation

## 1. Download / Install

```bash
brew tap shiyuecamus/ng-gateway
brew install ng-gateway
```

After installation, it is recommended to verify the version and command-line arguments:

```bash
ng-gateway --help
ng-gateway --version || true
```

## 2. Upgrade / Uninstall

### 2.1 Upgrade

```bash
brew upgrade ng-gateway
```

### 2.2 Uninstall

```bash
brew uninstall ng-gateway
```

::: warning Complete Uninstallation

Since Homebrew's best practice is **to avoid automatically deleting user data during uninstallation** (to prevent accidental deletion), if you confirm that you want to clean up the runtime directory and data, please manually execute the following steps.

```bash
# 1) Stop the background service first (if running)
brew services stop ng-gateway || true

# 2) Uninstall the program itself
brew uninstall ng-gateway

# 3) Delete the runtime directory (will delete SQLite DB, certificates, drivers/plugins, runtime generated files, etc.)
rm -rf "$(brew --prefix)/var/lib/ng-gateway"

# 4) Delete logs
rm -f "$(brew --prefix)/var/log/ng-gateway.log" \
      "$(brew --prefix)/var/log/ng-gateway.error.log"
```
:::

## 3. Runtime Directories

-   **Runtime Directory**: `$(brew --prefix)/var/lib/ng-gateway/`
-   **Configuration File**: `$(brew --prefix)/var/lib/ng-gateway/gateway.toml`

Default ports and access conventions:

-   **HTTP**: `8978`
-   **HTTPS**: `8979`
-   **API Prefix**: `/api`
-   **UI Mode**: `embedded_zip`

## 4. Modify Configuration

After modifying `$(brew --prefix)/var/lib/ng-gateway/gateway.toml`, restart the service to make the configuration take effect:

```bash
brew services restart ng-gateway
```

## 5. View Logs

### 5.1 Start / Stop

If your environment does not have `brew services` yet:

```bash
brew tap homebrew/services
```

Start/View/Stop:

```bash
brew services start ng-gateway
brew services list
brew services stop ng-gateway
```

### 5.2 Log Files

Homebrew services usually write standard output/error output to log files under `$(brew --prefix)/var/log/`:

```bash
tail -f "$(brew --prefix)/var/log/ng-gateway.log"
tail -f "$(brew --prefix)/var/log/ng-gateway.error.log"
```

::: tip
If you are not sure where the service writes logs, you can first check the service status/definition:

```bash
brew services info ng-gateway
```
:::

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
