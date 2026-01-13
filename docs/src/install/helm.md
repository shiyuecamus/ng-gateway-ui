---
title: Helm 安装
---

# Helm 安装

本章节介绍如何在 Kubernetes 集群中使用 Helm 部署 NG Gateway。

## 1. 前置条件

- **Kubernetes** 1.19+
- **Helm** 3.8+ (支持 OCI)
- **PV/PVC** 支持 (用于数据持久化)

## 2. 安装 Chart

### 方式一：从 OCI Registry 安装 (推荐)

如果 Chart 已推送到 OCI Registry（如 Docker Hub 或 Harbor）：

```bash
# 导出配置以便自定义
helm show values oci://registry.example.com/ng-gateway > values.yaml

# 安装 Release
helm install ng-gateway oci://registry.example.com/ng-gateway \
  --version 0.1.0 \
  -f values.yaml \
  --create-namespace \
  --namespace ng
```

### 方式二：从本地安装

如果您下载了源码：

```bash
cd deploy/helm/ng-gateway

# 安装
helm install ng-gateway . \
  --create-namespace \
  --namespace ng
```

## 3. 验证安装

查看 Pod 状态：

```bash
kubectl get pods -n ng
```

查看 Service（获取访问地址）：

```bash
kubectl get svc -n ng
```

## 4. 配置说明

关键配置项说明，详细配置请参考 `values.yaml`。

### 镜像配置

```yaml
gateway:
  image:
    registry: '' # 如果使用私有仓库，请配置
    repository: shiyuecamus/ng-gateway
    tag: 'latest'
```

### 持久化 (Persistence)

生产环境请务必启用持久化并配置正确的 `storageClass`。

```yaml
persistence:
  gatewayData:
    enabled: true
    size: 10Gi
    storageClass: '' # 留空使用默认存储类
  gatewayDrivers:
    enabled: true
    size: 2Gi
  gatewayPlugins:
    enabled: true
    size: 2Gi
```

### 服务暴露 (Service & Ingress)

默认使用 `ClusterIP`。如果需要外部访问，可以使用 `NodePort` 或 `Ingress`。

**NodePort 示例**:

```yaml
gateway:
  service:
    type: NodePort
    nodePort:
      http: 30080
```

**Ingress 示例**:

```yaml
ingress:
  enabled: true
  hosts:
    - host: gateway.example.com
```

## 5. 卸载

```bash
helm uninstall ng-gateway -n ng
```

::: warning 注意
PVC 默认不会被删除，以防止数据丢失。如果需要彻底清除，请手动删除 PVC。
:::
