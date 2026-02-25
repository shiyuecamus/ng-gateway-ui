---
title: Docker 安装
description: 使用 Docker 部署 NG Gateway（All-in-one）：下载安装、升级卸载、运行时目录与配置、日志、健康检查与默认账号。
---

# Docker 安装

本文档按“产品级安装手册”的顺序组织：**下载安装 → 升级卸载 → 运行时目录与配置 → 日志 → 健康检查与访问信息**。

## 1. 前置条件

- **Docker Engine**（建议 20.10+）
- **Docker Compose**（可选，用于编排）

## 2. 下载 / 安装

### 2.1 拉取镜像

```bash
docker pull shiyuecamus/ng-gateway:latest
```

### 2.2 安装并启动

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

::: tip 参数说明

| 参数 | 说明 |
| :-- | :-- |
| `-p 8978:5678` | 映射 Web UI/API 端口（HTTP） |
| `-p 8979:5679` | 映射 HTTPS 端口 |
| `-v gateway-data:/app/data` | **重要**：持久化核心数据（SQLite 数据库、配置等） |
| `-v gateway-drivers:/app/drivers/custom` | 持久化自定义驱动 |
| `-v gateway-plugins:/app/plugins/custom` | 持久化自定义插件 |
| `-v gateway-ai:/app/ai` | 持久化 AI 模型与数据 |
:::

## 3. 升级 / 卸载

### 3.1 升级

```bash
docker pull shiyuecamus/ng-gateway:latest
docker rm -f ng-gateway

# 使用与之前一致的端口/volume/环境变量重新启动
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

### 3.2 卸载

```bash
docker rm -f ng-gateway
```

::: warning 注意
上述卸载不会删除 `gateway-data` 等 volumes；如果你要“彻底清空数据”，需要额外删除对应 volume（务必确认后再做）。
:::


## 4. 运行时目录

- **数据与配置持久化**：`/app/data`（建议用 `gateway-data` volume）
- **自定义驱动目录**：`/app/drivers/custom`（建议用 `gateway-drivers` volume）
- **自定义插件目录**：`/app/plugins/custom`（建议用 `gateway-plugins` volume）
- **AI 模型与数据目录**：`/app/ai`（建议用 `gateway-ai` volume）

## 5. 配置方式

> 在容器场景，**推荐使用环境变量覆盖配置**：使用 `NG__...`（适合 K8s / Compose / 自动化运维）

### 5.1 示例：使用环境变量覆盖端口与日志级别

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

### 5.2 示例：使用 env 文件

创建 `.env`：

```bash
cat > .env <<'EOF'
NG__WEB__PORT=5678
NG__WEB__SSL__PORT=5679
RUST_LOG=info
EOF
```

启动：

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

::: warning 注意
生产环境务必持久化 `/app/data`（`gateway-data` volume），否则容器重建会丢失配置与数据库。
:::

## 6. 查看日志

```bash
docker logs -f --tail=200 ng-gateway
```

## 7. 健康检查

健康检查：

```bash
curl -fsS "http://127.0.0.1:8978/health" && echo
```

## 8. 默认访问地址

- **UI**：`http://<host-ip>:8978/`
- **API**：`http://<host-ip>:8978/api`

::: tip
- 默认账号: system_admin
- 默认密码: system_admin
:::

## 9. 使用 Docker Compose（可选）

创建 `docker-compose.yaml` 文件：

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
      # - RUST_LOG=info # 调整日志级别

volumes:
  gateway-data:
  gateway-drivers:
  gateway-plugins:
  gateway-ai:
```

启动：

```bash
docker-compose up -d
```

查看日志：

```bash
docker-compose logs -f --tail=200
```

升级：

```bash
docker-compose pull
docker-compose up -d
```
