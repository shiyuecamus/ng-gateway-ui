---
title: Linux 安装
description: Linux 环境下安装与运维 NG Gateway：deb/rpm + systemd（推荐）与源码编译（开发者）。
---

# Linux 安装

## 1. 下载 / 安装

### 1.1 下载

请在[发布页](https://github.com/shiyuecamus/ng-gateway/releases)下载与你的发行版与架构匹配的 `.deb` / `.rpm`：

::: tip
如果你不确定目标机架构，可以用 `uname -m`（例如 `x86_64` / `aarch64`）快速确认。
:::

### 1.2 安装

::: warning 说明
不同发行版包管理命令略有差异；包文件名以实际发布为准。
:::

**Debian/Ubuntu（.deb）**：

```bash
sudo dpkg -i ./ng-gateway_*.deb
```

如果提示依赖缺失，可执行：

```bash
sudo apt-get -f install -y
```

**RHEL/CentOS/Fedora（.rpm）**：

```bash
sudo rpm -ivh ./ng-gateway-*.rpm
```

或使用发行版推荐的包管理器：

```bash
sudo dnf install -y ./ng-gateway-*.rpm
```

### 1.3 启动与开机自启

```bash
sudo systemctl enable --now ng-gateway
sudo systemctl status ng-gateway --no-pager
```

## 2. 升级 / 卸载

### 2.1 升级

升级通常就是安装新包（deb/rpm 会覆盖安装区文件），然后重启服务：

```bash
sudo systemctl restart ng-gateway
```

### 2.2 卸载

```bash
# Debian/Ubuntu
sudo dpkg -r ng-gateway

# RHEL/CentOS/Fedora
sudo rpm -e ng-gateway
```

> 注意：卸载包一般不会自动删除 `/var/lib/ng-gateway/` 下的数据，以避免误删生产数据。

::: warning 彻底卸载
Linux 包安装遵循“卸载程序不自动删除数据目录”的最佳实践，因此如果你确认要清理运行目录与数据，请手动执行以下步骤。

```bash
# 1) 停止并禁用服务（如果你不再需要它）
sudo systemctl stop ng-gateway || true
sudo systemctl disable ng-gateway || true

# 2) 卸载程序本体（二选一，按你的发行版）
# Debian/Ubuntu
sudo dpkg -r ng-gateway

# RHEL/CentOS/Fedora
sudo rpm -e ng-gateway

# 3) 删除运行目录（会删除 SQLite DB、证书、drivers/plugins、运行时生成文件等）
sudo rm -rf /var/lib/ng-gateway

```
:::

## 3. 运行时目录

::: tip
Linux 打包遵循“只读安装区 + 独立配置 + 独立可写运行目录”的标准布局
:::

- **安装区**：`/opt/ng-gateway/`
  - `bin/ng-gateway-bin`
  - `drivers/builtin/*.so`
  - `plugins/builtin/*.so`
- **配置文件**：`/etc/ng-gateway/gateway.toml`
- **运行时目录（WorkingDirectory）**：`/var/lib/ng-gateway/`
  - `data/ng-gateway.db`（SQLite 首次启动自动创建并迁移）
  - `drivers/`、`plugins/`、`certs/`、`pki/` 等

默认端口与访问约定（以 Linux 发行包自带 `gateway.toml` 为准）：

- **HTTP**：`8978`
- **HTTPS**：`8979`
- **API 前缀**：`/api`
- **UI 模式**：`embedded_zip`

::: tip 为什么必须有稳定 WorkingDirectory？
网关会把 driver/plugin 的路径以“运行根目录相对路径”的方式写入 SQLite（例如 `./drivers/builtin/libng_driver_modbus.so`）。  
因此 systemd unit 固定 `WorkingDirectory=/var/lib/ng-gateway`，以保证路径长期可用、易于迁移与备份。
:::

## 4. 修改配置
修改 `/etc/ng-gateway/gateway.toml` 后，重启服务使配置生效：

```bash
sudo systemctl restart ng-gateway
```

## 5. 查看日志

查看实时日志：

```bash
sudo journalctl -u ng-gateway -f
```

查看最近 200 行：

```bash
sudo journalctl -u ng-gateway -n 200 --no-pager
```

## 6. 健康检查

健康检查：

```bash
curl -fsS "http://127.0.0.1:8978/health" && echo
```

## 7. 默认访问地址

- **UI**：`http://<host-ip>:8978/`
- **API**：`http://<host-ip>:8978/api`

::: tip
- 默认账号: system_admin
- 默认密码: system_admin
:::
