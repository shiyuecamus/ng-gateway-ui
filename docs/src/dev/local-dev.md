---
title: 本地开发
description: 推荐的本地开发姿势：后端用 cargo xtask，前端/文档用 pnpm dev:antd / pnpm dev:docs，避免重复打包与不必要的等待。
---

# 本地开发

本章面向研发同学，目标是：**后端/驱动/插件** 与 **UI/文档** 各自走最合适的开发链路，保证迭代速度与联调一致性。

## 开发工作流总览（推荐）

- **后端（网关 + drivers/plugins）**：用 `cargo xtask build` 统一构建与部署
- **Web UI（管理台）**：用 `pnpm dev:antd` 启动 Vite dev server，使用 proxy 联调后端
- **文档站（VitePress）**：用 `pnpm dev:docs` 预览与编写

:::: tip 为什么不建议开发期频繁 build UI？
`cargo xtask build` 默认会 build UI 并打包，这更偏向“集成构建/发布”。  
开发期 UI 频繁改动时，建议直接用 dev server（HMR + 更快的增量构建），只在需要验证“网关内置 UI 静态资源”时再走一次 UI build。
::::

## 0. 前置条件

请先完成：[`源码编译安装`](../install/source-build.md) 里的 **Rust 工具链** 与 **系统依赖**。  
UI/Docs 还需要 Node + pnpm（版本要求见 `ng-gateway-ui/package.json` 的 `engines`）。

## 1. 启动后端（网关）

### 1.1 Debug 构建（推荐）

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

### 1.3 常用调试开关

```bash
export RUST_LOG=info
# 更细日志：export RUST_LOG=debug
./target/debug/ng-gateway-bin --config ./gateway.toml
```

## 2. 启动 Web UI（推荐：dev server）

在仓库根目录执行：

```bash
cd ng-gateway-ui
pnpm install
pnpm dev:antd
```

### 2.1 API 代理与端口约定（很关键）

`web-antd` 的 Vite dev server 已内置 proxy（见 `ng-gateway-ui/apps/web-antd/vite.config.mts`）：

- 浏览器访问 `http://localhost:<vite-port>/api/...`
- Vite 会把请求代理到 **后端** `http://localhost:5678/api/...`（并启用 ws）

因此：

- **推荐把本地后端跑在 `5678`**（使用仓库默认 `gateway.toml` 即可）
- 如果你修改了后端端口，请同步修改 `vite.config.mts` 里的 proxy `target`

## 3. 启动文档站（VitePress）

在仓库根目录执行：

```bash
cd ng-gateway-ui
pnpm install
pnpm dev:docs
```

## 4. 联调注意事项（高频踩坑）

### 4.1 不要在错误的目录运行网关

如果你不在仓库根目录启动，默认相对路径可能失效（例如 `gateway.toml`、`./drivers`、`./plugins`、`./data`）。  
最稳妥的方式是：**永远在仓库根目录运行**，或显式使用 `--config` 指定配置文件全路径。

### 4.2 UI 静态资源由网关提供 vs dev server

- **dev server（推荐）**：前端迭代快、支持 HMR
- **网关 filesystem 模式**：用于验证“最终部署形态”（例如 docker 镜像把 dist 放到 `/app/ui`）
- **网关 embedded_zip 模式**：用于单二进制发行（Homebrew 等）

当你在做 UI 开发时，建议把“页面访问入口”固定在 dev server 的地址；只把后端作为 API 服务即可。

