---
title: macOS 安装
description: macOS 环境下安装与运维 NG Gateway：Homebrew 安装、升级卸载、运行时目录与配置、日志、健康检查与默认账号。
---

# macOS 安装

## 1. 下载 / 安装

```bash
brew tap shiyuecamus/ng-gateway
brew install ng-gateway
```

安装完成后，建议先确认版本与命令行参数：

```bash
ng-gateway --help
ng-gateway --version || true
```

## 2. 升级 / 卸载

### 2.1 升级

```bash
brew upgrade ng-gateway
```

### 2.2 卸载

```bash
brew uninstall ng-gateway
```

::: warning 彻底卸载

由于 Homebrew 的最佳实践是**避免在卸载时自动删除用户数据**（防止误删），因此如果你确认要清理运行目录与数据，请手动执行以下步骤。

```bash
# 1) 先停止后台服务（如果正在运行）
brew services stop ng-gateway || true

# 2) 卸载程序本体
brew uninstall ng-gateway

# 3) 删除运行目录（会删除 SQLite DB、证书、drivers/plugins、运行时生成文件等）
rm -rf "$(brew --prefix)/var/lib/ng-gateway"

# 4) 删除日志
rm -f "$(brew --prefix)/var/log/ng-gateway.log" \
      "$(brew --prefix)/var/log/ng-gateway.error.log"
```
:::

## 3. 运行时目录

- **运行目录**：`$(brew --prefix)/var/lib/ng-gateway/`
- **配置文件**：`$(brew --prefix)/var/lib/ng-gateway/gateway.toml`

默认端口与访问约定：

- **HTTP**：`8978`
- **HTTPS**：`8979`
- **API 前缀**：`/api`
- **UI 模式**：`embedded_zip`

## 4. 修改配置

修改 `$(brew --prefix)/var/lib/ng-gateway/gateway.toml` 后，重启服务使配置生效：

```bash
brew services restart ng-gateway
```

## 5. 查看日志

### 5.1 启动 / 停止

如果你的环境里还没有 `brew services`：

```bash
brew tap homebrew/services
```

启动/查看/停止：

```bash
brew services start ng-gateway
brew services list
brew services stop ng-gateway
```

### 5.2 日志文件

Homebrew service 通常会把标准输出/错误输出写入 `$(brew --prefix)/var/log/` 下的日志文件：

```bash
tail -f "$(brew --prefix)/var/log/ng-gateway.log"
tail -f "$(brew --prefix)/var/log/ng-gateway.error.log"
```

::: tip
如果你不确定服务具体把日志写到了哪里，可以先查看服务状态/定义：

```bash
brew services info ng-gateway
```
:::

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