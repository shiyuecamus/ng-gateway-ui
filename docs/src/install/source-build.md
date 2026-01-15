---
title: 源码编译安装
description: 面向二次开发与私有化部署：使用 cargo xtask 一键构建网关、驱动/插件并可选打包 UI（filesystem / embedded_zip）。
---

# 源码编译

## 适用场景

- **二次开发**：修改网关核心逻辑、驱动、插件或 Web API 后自编译运行
- **离线/受限环境**：无法直接拉取镜像或使用外部仓库
- **可控交付**：希望自建 Release、可复现构建、可控依赖版本

## 关键概念：运行时目录（WorkingDirectory / runtime_dir）

NG Gateway 的配置、数据、驱动、插件、证书等默认以“运行时根目录”的相对路径组织（例如 `./data`、`./drivers`、`./plugins`、`./certs`）。

:::: tip 重要建议
**本地源码运行时**，请直接在仓库根目录运行二进制（确保 `./gateway.toml`、`./drivers`、`./plugins` 的相对路径成立），避免出现“数据库里记录的 driver/plugin 路径失效”的问题。
::::

## 前置条件

### 必备软件

- **Rust 工具链**：建议使用 `rustup` 安装 stable
- **Node.js + pnpm**
  - Node 版本：>=20.12.0
  - pnpm 版本：>=10.0.0

### 系统依赖

::: warning 说明
仓库包含 Kafka/Pulsar 等插件，部分依赖会拉取/编译原生库（例如 `libsasl2`、`libclang`、`protoc`）。

**macOS（Homebrew）**：

```bash
brew update
brew install cmake pkg-config protobuf llvm cyrus-sasl
```

**Debian/Ubuntu**：

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  pkg-config \
  protobuf-compiler \
  clang \
  libclang-dev \
  libsasl2-dev \
  perl \
  cmake
```

:::

## 1. 获取源码

```bash
git clone https://github.com/shiyuecamus/ng-gateway.git
cd ng-gateway
```

## 2. 构建

本仓库采用 **xtask pattern** 统一构建流程：

- 构建网关二进制（`ng-gateway-bin`）
- 构建并部署 drivers（`drivers/builtin/`）与 plugins（`plugins/builtin/`）
- 构建 UI 并打包为 `ng-gateway-web/ui-dist.zip`

### 2.1 Debug 构建

```bash
cargo xtask build --profile debug
```

### 2.2 Release 构建

```bash
cargo xtask build --profile release
```

### 2.3 常用参数

```bash
# 只构建后端（跳过 UI 构建），适合没有 Node/pnpm 的环境
cargo xtask build --profile debug --without-ui

# 只构建网关二进制（跳过 drivers/plugins 发现与部署），适合某些打包场景
cargo xtask build --profile release --bin-only

# 指定 UI 应用（默认 web-antd）
cargo xtask build --profile debug --ui-app web-antd

# 透传 cargo build 参数（注意：-- 后面的参数会传给 cargo build）
cargo xtask build --profile release -- --target x86_64-unknown-linux-gnu
```

## 3. 运行

### 3.1 使用默认配置运行（推荐从仓库根目录运行）

```bash
./target/debug/ng-gateway-bin --config ./gateway.toml
```

### 3.2 使用自定义配置文件

```bash
./target/release/ng-gateway-bin --config /path/to/gateway.toml
```

也可以使用环境变量：

```bash
export NG_CONFIG=/path/to/gateway.toml
./target/release/ng-gateway-bin
```

### 3.3 健康检查与访问地址

- **健康检查**：`GET /health`
- **API**：默认前缀为 `/api`（见 `gateway.toml` 的 `[web].router_prefix`）
- **UI**：当 `[web.ui].enabled=true` 时，UI 由网关进程在 `/` 提供

示例：

```bash
curl -fsS "http://127.0.0.1:5678/health" && echo
```

## 4. UI 的三种模式

NG Gateway 的 UI 可以按场景选择三种模式（见 `gateway.toml` 的 `[web.ui]`）：

- **filesystem（开发/容器 all-in-one 推荐）**
  - 网关直接从 `filesystem_root` 提供静态文件（通常是 Vite 的 `dist/`）
- **embedded_zip（单二进制发行推荐）**
  - UI 以 `ui-dist.zip` 的形式在编译期嵌入二进制（适合 Homebrew/离线单机交付）
- **disabled（纯后端/Headless）**
  - 完全关闭 UI 静态资源服务

:::: warning 研发建议
做前端开发时，不要频繁 rebuild/pack UI；建议使用 [`本地开发`](../dev/local-dev.md) 里描述的 **`pnpm dev:antd`** 或 **`pnpm dev:docs`**，体验更快、调试更友好。
::::

## 5. 常见问题

### 5.1 构建失败：找不到 libsasl / libclang / protoc

- Linux：优先按本章“系统依赖（Debian/Ubuntu）”安装 `libsasl2-dev`、`libclang-dev`、`protobuf-compiler`
- macOS：优先使用 `brew install protobuf llvm cyrus-sasl`

### 5.2 UI 404 或空白页

通常是 UI dist 没构建或路径不对：

- 确认 `gateway.toml`：
  - `[web.ui].enabled=true`
  - `[web.ui].mode="filesystem"`
  - `[web.ui].filesystem_root` 指向真实的 `dist/` 目录
- 或者直接重新执行：`cargo xtask build --profile debug`（默认会构建 UI）
