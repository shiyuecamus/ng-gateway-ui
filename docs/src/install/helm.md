---
title: Helm 安装
---

# Helm 安装

## 1. 前置条件

- **Kubernetes** 1.19+
- **Helm** 3.8+ (支持 OCI)
- **PV/PVC** 支持 (用于数据持久化)

## 2. 安装 Chart

```bash
# 导出配置以便自定义
CHART_VERSION="<CHART_VERSION>"

helm show values oci://registry-1.docker.io/shiyuecamus/ng-gateway-chart \
  --version "${CHART_VERSION}" \
  > values.yaml

# 安装 Release
helm install ng-gateway oci://registry-1.docker.io/shiyuecamus/ng-gateway-chart \
  --version "${CHART_VERSION}" \
  -f values.yaml \
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

### 3.1 本地访问

当 Service 类型为 `ClusterIP` 且你暂时不想配置 Ingress/NodePort 时，推荐使用 `kubectl port-forward` 在本机临时打开访问通道（适合开发/排障）。

1) 找到网关 Service 名：

```bash
kubectl get svc -n ng
```

默认 release 名为 `ng-gateway` 时，Service 通常为：

- `ng-gateway-service`

2) 端口转发（将集群内端口映射到本机 `8978/8979`，与 Docker/macOS 默认端口对齐）：

```bash
# HTTP（本机 8978 -> 集群 service 8978）
kubectl -n ng port-forward svc/ng-gateway-service 8978:8978

# HTTPS（可选；仅当你开启了 web.ssl.enabled）
kubectl -n ng port-forward svc/ng-gateway-service 8979:8979
```

3) 健康检查与访问：

```bash
curl -fsS "http://127.0.0.1:8978/health" && echo
```

- **UI**：`http://127.0.0.1:8978/`
- **API**：`http://127.0.0.1:8978/api`
- **默认账号/密码**：`system_admin / system_admin`

::: warning 注意事项
- `port-forward` 默认只监听 `127.0.0.1`；如果你确实需要从局域网其他机器访问，可加 `--address 0.0.0.0`（请评估安全风险）。
- 如果你修改了 Chart 的 `gateway.config.web.port` / `gateway.config.web.ssl.port`，请同步修改上面命令右侧的目标端口（例如 `8978:<web.port>`）。
:::

### 3.2 查看日志

```bash
# 推荐用 label 选择器（避免依赖具体资源名）
kubectl logs -n ng -l "app.kubernetes.io/component=gateway" -f --tail=200
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
