---
title: Helm Installation
---

# Helm Installation

## 1. Prerequisites

-   **Kubernetes** 1.19+
-   **Helm** 3.8+ (Supports OCI)
-   **PV/PVC** Support (For data persistence)

## 2. Install Chart

```bash
# Export configuration for customization
CHART_VERSION="<CHART_VERSION>"

helm show values oci://registry-1.docker.io/shiyuecamus/ng-gateway-chart \
  --version "${CHART_VERSION}" \
  > values.yaml

# Install Release
helm install ng-gateway oci://registry-1.docker.io/shiyuecamus/ng-gateway-chart \
  --version "${CHART_VERSION}" \
  -f values.yaml \
  --create-namespace \
  --namespace ng
```

## 3. Verify Installation

Check Pod status:

```bash
kubectl get pods -n ng
```

Check Service (Get access address):

```bash
kubectl get svc -n ng
```

### 3.1 Local Access

When the Service type is `ClusterIP` and you don't want to configure Ingress/NodePort temporarily, it is recommended to use `kubectl port-forward` to open an access channel locally (suitable for development/troubleshooting).

1) Find Gateway Service Name:

```bash
kubectl get svc -n ng
```

When the default release name is `ng-gateway`, the Service is usually:

-   `ng-gateway-service`

2) Port Forwarding (Map in-cluster port to local `8978/8979`, aligning with Docker/macOS default ports):

```bash
# HTTP (Local 8978 -> Cluster service 8978)
kubectl -n ng port-forward svc/ng-gateway-service 8978:8978

# HTTPS (Optional; only if you enabled web.ssl.enabled)
kubectl -n ng port-forward svc/ng-gateway-service 8979:8979
```

3) Health Check & Access:

```bash
curl -fsS "http://127.0.0.1:8978/health" && echo
```

-   **UI**: `http://127.0.0.1:8978/`
-   **API**: `http://127.0.0.1:8978/api`
-   **Default Account/Password**: `system_admin / system_admin`

::: warning Precautions
-   `port-forward` defaults to listening only on `127.0.0.1`; if you really need access from other machines in the LAN, you can add `--address 0.0.0.0` (please evaluate security risks).
-   If you modified `gateway.config.web.port` / `gateway.config.web.ssl.port` in the Chart, please synchronize the target port on the right side of the command above (e.g., `8978:<web.port>`).
:::

### 3.2 View Logs

```bash
# Recommended to use label selector (avoid dependency on specific resource names)
kubectl logs -n ng -l "app.kubernetes.io/component=gateway" -f --tail=200
```

## 4. Configuration Description

Key configuration items description. For detailed configuration, please refer to `values.yaml`.

### Image Configuration

```yaml
gateway:
  image:
    registry: '' # Configure if using private registry
    repository: shiyuecamus/ng-gateway
    tag: 'latest'
```

### Persistence

Please ensure persistence is enabled and correct `storageClass` is configured for production environments.

```yaml
persistence:
  gatewayData:
    enabled: true
    size: 10Gi
    storageClass: '' # Leave empty to use default storage class
  gatewayDrivers:
    enabled: true
    size: 2Gi
  gatewayPlugins:
    enabled: true
    size: 2Gi
```

### Service Exposure (Service & Ingress)

Defaults to `ClusterIP`. If external access is needed, `NodePort` or `Ingress` can be used.

**NodePort Example**:

```yaml
gateway:
  service:
    type: NodePort
    nodePort:
      http: 30080
```

**Ingress Example**:

```yaml
ingress:
  enabled: true
  hosts:
    - host: gateway.example.com
```

## 5. Uninstall

```bash
helm uninstall ng-gateway -n ng
```

::: warning Note
PVCs are not deleted by default to prevent data loss. If you need to clear completely, please delete PVCs manually.
:::
