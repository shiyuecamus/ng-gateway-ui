---
title: 本地开发
description: 推荐的本地开发姿势：后端用 cargo xtask，前端/文档用 pnpm dev:antd / pnpm dev:docs，避免重复打包与不必要的等待。
---

# 本地开发

本章面向研发同学，目标是：**后端/驱动/插件** 与 **UI/文档** 各自走最合适的开发链路，保证迭代速度与联调一致性。

## 开发工作流总览

- **后端（网关 + drivers/plugins）**：用 `cargo xtask build` 统一构建与部署
- **Web UI（管理台）**：用 `pnpm dev:antd` 启动 Vite dev server，使用 proxy 联调后端

:::: tip 为什么不建议开发期频繁 build UI？
`cargo xtask build` 默认会 build UI 并打包，这更偏向“集成构建/发布”。  
开发期 UI 频繁改动时，建议直接用 dev server（HMR + 更快的增量构建），只在需要验证“网关内置 UI 静态资源”时再走一次 UI build。
::::

## 0. 前置条件

请先完成：[`源码编译安装`](../install/source-build.md) 里的 **Rust 工具链** 与 **系统依赖**。  
UI/Docs 还需要 Node + pnpm（版本要求见 `ng-gateway-ui/package.json` 的 `engines`）。

## 1. 启动网关后端

### 1.1 Debug 构建

在仓库根目录执行：

```bash
cargo xtask build --profile debug --without-ui
```

> 说明：`--without-ui` 会跳过 UI build，让后端迭代更快；drivers/plugins 仍会被构建并部署到 `drivers/builtin`、`plugins/builtin`。

### 1.2 运行

```bash
./target/debug/ng-gateway-bin --config ./gateway.toml
```

健康检查：

```bash
curl -fsS "http://127.0.0.1:5678/health" && echo
```

## 2. 启动 Web UI

在仓库根目录执行：

```bash
cd ng-gateway-ui
pnpm install
pnpm dev:antd
```

### 2.1 API 代理与端口约定

`web-antd` 的 Vite dev server 已内置 proxy（见 `ng-gateway-ui/apps/web-antd/vite.config.mts`）：

- 浏览器访问 `http://localhost:<vite-port>/api/...`
- Vite 会把请求代理到 **后端** `http://localhost:5678/api/...`（并启用 ws）

::: warning

- **推荐把本地后端跑在 `5678`**（使用仓库默认 `gateway.toml` 即可）
- 如果你修改了后端端口，请同步修改 `vite.config.mts` 里的 proxy `target`

:::

## 3. 联调注意事项

### 3.1 不要在错误的目录运行网关

如果你不在仓库根目录启动，默认相对路径可能失效（例如 `gateway.toml`、`./drivers`、`./plugins`、`./data`）。  
最稳妥的方式是：**永远在仓库根目录运行**，或显式使用 `--config` 指定配置文件全路径。

### 3.2 UI 静态资源由网关提供 vs dev server

- **dev server（推荐）**：前端迭代快、支持 HMR
- **网关 filesystem 模式**：用于验证“最终部署形态”（例如 docker 镜像把 dist 放到 `/app/ui`）
- **网关 embedded_zip 模式**：用于单二进制发行（Homebrew 等）

当你在做 UI 开发时，建议把“页面访问入口”固定在 dev server 的地址；只把后端作为 API 服务即可。

## 5. `cargo xtask` 速查

本仓库使用 `ng-gateway-xtask` 作为“集成构建器”，核心目标是把 **网关二进制 + drivers/plugins 动态库 +（可选）UI 打包** 串成一条稳定流水线。

### 5.1 最常用命令

在仓库根目录执行：

```bash
# 构建后端 + drivers + plugins + UI，并把动态库部署到 drivers/builtin 与 plugins/builtin（默认）
cargo xtask build

# 后端/驱动/插件开发时更快（跳过 UI build）
cargo xtask build --profile debug --without-ui

# 仅构建网关二进制（发布/打包场景用，跳过 drivers/plugins 发现与部署）
cargo xtask build --bin-only --profile release

# 构建但不自动部署（你想手动拷贝/对比产物时）
cargo xtask build --no-deploy

# 仅执行部署（从 target/<profile> 复制 libng_driver_* / libng_plugin_* 到 builtin 目录）
cargo xtask deploy --profile debug

# 清理构建产物；加 --all 会额外删除 drivers/builtin 与 plugins/builtin
cargo xtask clean --all
```

### 5.2 `xtask build` 到底做了什么？

默认 `cargo xtask build` 会：

- **发现并构建所有 driver/plugin crate**
  - drivers：`ng-gateway-southward/*`
  - plugins：`ng-gateway-northward/*`
- **构建 `ng-gateway-bin`**
- **按平台扩展名部署动态库** 到：
  - `drivers/builtin/libng_driver_*.{so|dylib|dll}`
  - `plugins/builtin/libng_plugin_*.{so|dylib|dll}`
- **可选构建 UI**：默认会构建 `ng-gateway-ui/apps/web-antd` 并打包为 `ng-gateway-web/ui-dist.zip`

> 关键约束：driver/plugin crate 必须在 `Cargo.toml` 中配置 `[lib] crate-type = ["cdylib", "rlib"]`，并且 crate name 推荐遵循：
>
> - driver：`ng-driver-xxx` → 产物文件名 `libng_driver_xxx.*`
> - plugin：`ng-plugin-yyy` → 产物文件名 `libng_plugin_yyy.*`

### 5.3 只想调试某一个 driver/plugin 怎么做？

最佳实践（开发期）：

```bash
# 1) 只构建你要改的 crate + 主程序（更快）
cargo build -p ng-driver-modbus -p ng-gateway-bin

# 2) 把构建出的动态库部署到 builtin（避免你手动找路径）
cargo xtask deploy --profile debug

# 3) 重启网关进程（动态库加载发生在启动阶段；运行中替换文件不保证生效）
./target/debug/ng-gateway-bin --config ./gateway.toml
```

> 说明：`deploy` 会按文件名 glob 复制所有已构建的 `libng_driver_*`/`libng_plugin_*`，因此“只构建一个 crate + deploy”就能实现“只替换一个动态库”的效果。
