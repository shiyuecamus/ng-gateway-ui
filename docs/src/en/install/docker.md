---
title: Docker Installation
description: 'Deploy NG Gateway using Docker (All-in-one): Download, install, upgrade, uninstall, runtime directories & configuration, logs, health checks, and default accounts.'
---

# Docker Installation

This document is organized in the order of a "Product Installation Manual": **Download & Install → Upgrade & Uninstall → Runtime Directories & Configuration → Logs → Health Check & Access Info**.

## 1. Prerequisites

-   **Docker Engine** (Recommended 20.10+)
-   **Docker Compose** (Optional, for orchestration)

## 2. Download / Install

### 2.1 Pull Image

```bash
docker pull shiyuecamus/ng-gateway:latest
```

### 2.2 Install and Start

```bash
docker run -d --name ng-gateway \
  --privileged=true \
  --restart unless-stopped \
  -p 8978:5678 \
  -p 8979:5679 \
  -v gateway-data:/app/data \
  -v gateway-drivers:/app/drivers/custom \
  -v gateway-plugins:/app/plugins/custom \
  -v gateway-ai:/app/ai \
  shiyuecamus/ng-gateway:latest
```

::: tip Parameter Explanation

| Parameter | Description |
| :-- | :-- |
| `-p 8978:5678` | Map Web UI/API port (HTTP) |
| `-p 8979:5679` | Map HTTPS port |
| `-v gateway-data:/app/data` | **Important**: Persist core data (SQLite database, configuration, etc.) |
| `-v gateway-drivers:/app/drivers/custom` | Persist custom drivers |
| `-v gateway-plugins:/app/plugins/custom` | Persist custom plugins |
| `-v gateway-ai:/app/ai` | Persist AI models and related data |
:::

## 3. Upgrade / Uninstall

### 3.1 Upgrade

```bash
docker pull shiyuecamus/ng-gateway:latest
docker rm -f ng-gateway

# Restart using the same ports/volumes/environment variables as before
docker run -d --name ng-gateway \
  --privileged=true \
  --restart unless-stopped \
  -p 8978:5678 \
  -p 8979:5679 \
  -v gateway-data:/app/data \
  -v gateway-drivers:/app/drivers/custom \
  -v gateway-plugins:/app/plugins/custom \
  -v gateway-ai:/app/ai \
  shiyuecamus/ng-gateway:latest
```

### 3.2 Uninstall

```bash
docker rm -f ng-gateway
```

::: warning Note
The above uninstallation will not delete volumes like `gateway-data`; if you want to "completely clear data", you need to delete the corresponding volume additionally (please confirm before doing so).
:::

## 4. Runtime Directories

-   **Data & Configuration Persistence**: `/app/data` (Recommended to use `gateway-data` volume)
-   **Custom Driver Directory**: `/app/drivers/custom` (Recommended to use `gateway-drivers` volume)
-   **Custom Plugin Directory**: `/app/plugins/custom` (Recommended to use `gateway-plugins` volume)
-   **AI Models & Data Directory**: `/app/ai` (Recommended to use `gateway-ai` volume)

## 5. Configuration Method

> In container scenarios, **it is recommended to use environment variables to override configuration**: Use `NG__...` (Suitable for K8s / Compose / Automated Ops).

### 5.1 Example: Override Port and Log Level with Environment Variables

```bash
docker run -d --name ng-gateway \
  -e NG__WEB__PORT=5678 \
  -e NG__WEB__SSL__PORT=5679 \
  -e RUST_LOG=info \
  -v gateway-data:/app/data \
  -v gateway-drivers:/app/drivers/custom \
  -v gateway-plugins:/app/plugins/custom \
  -v gateway-ai:/app/ai \
  -p 8978:5678 \
  -p 8979:5679 \
  shiyuecamus/ng-gateway:latest
```

### 5.2 Example: Using env File

Create `.env`:

```bash
cat > .env <<'EOF'
NG__WEB__PORT=5678
NG__WEB__SSL__PORT=5679
RUST_LOG=info
EOF
```

Start:

```bash
docker run -d --name ng-gateway \
  --env-file ./.env \
  -v gateway-data:/app/data \
  -v gateway-drivers:/app/drivers/custom \
  -v gateway-plugins:/app/plugins/custom \
  -v gateway-ai:/app/ai \
  -p 8978:5678 \
  -p 8979:5679 \
  shiyuecamus/ng-gateway:latest
```

::: warning Note
For production environments, be sure to persist `/app/data` (`gateway-data` volume), otherwise container recreation will lose configuration and database.
:::

## 6. View Logs

```bash
docker logs -f --tail=200 ng-gateway
```

## 7. Health Check

Health Check:

```bash
curl -fsS "http://127.0.0.1:8978/health" && echo
```

## 8. Default Access Address

-   **UI**: `http://<host-ip>:8978/`
-   **API**: `http://<host-ip>:8978/api`

::: tip
-   Default Account: system_admin
-   Default Password: system_admin
:::

## 9. Using Docker Compose (Optional)

Create `docker-compose.yaml` file:

```yaml
version: '3.8'

services:
  gateway:
    image: shiyuecamus/ng-gateway:latest
    container_name: ng-gateway
    restart: unless-stopped
    ports:
      - '8978:5678'
      - '8979:5679'
    volumes:
      - gateway-data:/app/data
      - gateway-drivers:/app/drivers/custom
      - gateway-plugins:/app/plugins/custom
      - gateway-ai:/app/ai
    environment:
      - TZ=Asia/Shanghai
      # - RUST_LOG=info # Adjust log level

volumes:
  gateway-data:
  gateway-drivers:
  gateway-plugins:
  gateway-ai:
```

Start:

```bash
docker-compose up -d
```

View Logs:

```bash
docker-compose logs -f --tail=200
```

Upgrade:

```bash
docker-compose pull
docker-compose up -d
```
