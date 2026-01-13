---
title: Docker 安装
---

# Docker 安装

本章节介绍如何使用 Docker 快速部署 NG Gateway。

## 1. 前置条件

- **Docker Engine** (建议 20.10+)
- **Docker Compose** (可选，用于编排)

## 2. 快速启动

NG Gateway 采用 **All-in-one** 架构，单容器即可运行。

```bash
docker run -d --name ng-gateway \
  --privileged=true \
  --restart unless-stopped \
  -p 8978:5678 \
  -p 8979:5679 \
  -v gateway-data:/app/data \
  -v gateway-drivers:/app/drivers/custom \
  -v gateway-plugins:/app/plugins/custom \
  shiyuecamus/ng-gateway:latest
```

### 参数说明

| 参数 | 说明 |
| :-- | :-- |
| `-p 8978:5678` | 映射 Web UI/API 端口（HTTP） |
| `-p 8979:5679` | 映射 HTTPS 端口 |
| `-v gateway-data:/app/data` | **重要**：持久化核心数据（SQLite 数据库、配置等） |
| `-v gateway-drivers:/app/drivers/custom` | 持久化自定义驱动 |
| `-v gateway-plugins:/app/plugins/custom` | 持久化自定义插件 |

::: warning 注意

- 生产环境强烈建议挂载 `gateway-data` 卷，否则重启容器将丢失所有配置。
- UI 访问地址：`http://<host-ip>:8978/`
- 默认账号：`system_admin` / `system_admin`
:::

## 3. 使用 Docker Compose

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
    environment:
      - TZ=Asia/Shanghai
      # - RUST_LOG=info # 调整日志级别

volumes:
  gateway-data:
  gateway-drivers:
  gateway-plugins:
```

启动服务：

```bash
docker-compose up -d
```

## 4. 升级指南

```bash
# 1. 拉取最新镜像
docker pull shiyuecamus/ng-gateway:latest

# 2. 停止并删除旧容器 (数据保留在 volume 中)
docker rm -f ng-gateway

# 3. 重新启动
docker run -d --name ng-gateway ... # 使用相同的启动命令
```

如果您使用 Docker Compose：

```bash
docker-compose pull
docker-compose up -d
```
