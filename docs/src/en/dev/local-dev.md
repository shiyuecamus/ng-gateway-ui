---
title: Local Development
description: 'Recommended local development posture: Backend uses cargo xtask, Frontend/Docs use pnpm dev:antd / pnpm dev:docs, avoiding repeated packaging and unnecessary waiting.'
---

# Local Development

This chapter is for R&D colleagues, aiming to: **Backend/Driver/Plugin** and **UI/Docs** each go their most suitable development link, ensuring iteration speed and integration consistency.

## Development Workflow Overview

-   **Backend (Gateway + drivers/plugins)**: Use `cargo xtask build` for unified build and deployment
-   **Web UI (Console)**: Use `pnpm dev:antd` to start Vite dev server, use proxy to integrate with backend

:::: tip Why not recommend frequent UI build during development?
`cargo xtask build` builds UI and packages by default, which leans more towards "Integration Build/Release".
When UI changes frequently during development, suggest using dev server directly (HMR + Faster incremental build), only run UI build once when verifying "Gateway Built-in UI Static Resources".
::::

## 0. Prerequisites

Please complete: **Rust Toolchain** and **System Dependencies** in [`Source Build Installation`](../install/source-build.md).
UI/Docs also need Node + pnpm (Version requirements see `engines` in `ng-gateway-ui/package.json`).

## 1. Start Gateway Backend

### 1.1 Debug Build

Execute in repository root:

```bash
cargo xtask build --profile debug --without-ui
```

> Note: `--without-ui` skips UI build, making backend iteration faster; drivers/plugins are still built and deployed to `drivers/builtin`, `plugins/builtin`.

### 1.2 Run

```bash
./target/debug/ng-gateway-bin --config ./gateway.toml
```

Health Check:

```bash
curl -fsS "http://127.0.0.1:5678/health" && echo
```

## 2. Start Web UI

Execute in repository root:

```bash
cd ng-gateway-ui
pnpm install
pnpm dev:antd
```

### 2.1 API Proxy and Port Convention

`web-antd` Vite dev server has built-in proxy (See `ng-gateway-ui/apps/web-antd/vite.config.mts`):

-   Browser access `http://localhost:<vite-port>/api/...`
-   Vite proxies request to **Backend** `http://localhost:5678/api/...` (And enables ws)

::: warning

-   **Recommend running local backend on `5678`** (Use repo default `gateway.toml`)
-   If you modify backend port, please synchronously modify proxy `target` in `vite.config.mts`

:::

## 3. Integration Notes

### 3.1 Do not run gateway in wrong directory

If you don't start in repository root, default relative paths may fail (e.g., `gateway.toml`, `./drivers`, `./plugins`, `./data`).
Safest way is: **Always run in repository root**, or explicitly use `--config` to specify full path of config file.

### 3.2 UI Static Resources Provided by Gateway vs Dev Server

-   **dev server (Recommended)**: Frontend iteration fast, supports HMR
-   **Gateway filesystem mode**: Used to verify "Final Deployment Form" (e.g., docker image puts dist into `/app/ui`)
-   **Gateway embedded_zip mode**: Used for single binary release (Homebrew etc.)

When doing UI development, suggest fixing "Page Access Entry" to dev server address; only use backend as API service.

## 5. `cargo xtask` Quick Reference

This repository uses `ng-gateway-xtask` as "Integration Builder", core goal is to chain **Gateway Binary + Drivers/Plugins Dynamic Libraries + (Optional) UI Packaging** into a stable pipeline.

### 5.1 Most Common Commands

Execute in repository root:

```bash
# Build Backend + drivers + plugins + UI, and deploy dynamic libraries to drivers/builtin and plugins/builtin (Default)
cargo xtask build

# Faster for Backend/Driver/Plugin development (Skip UI build)
cargo xtask build --profile debug --without-ui

# Build gateway binary only (For release/packaging scenarios, skip drivers/plugins discovery and deployment)
cargo xtask build --bin-only --profile release

# Build but no auto deploy (When you want to manually copy/compare artifacts)
cargo xtask build --no-deploy

# Deploy only (Copy libng_driver_* / libng_plugin_* from target/<profile> to builtin directory)
cargo xtask deploy --profile debug

# Clean build artifacts; add --all to additionally delete drivers/builtin and plugins/builtin
cargo xtask clean --all
```

### 5.2 What does `xtask build` actually do?

Default `cargo xtask build` will:

-   **Discover and build all driver/plugin crates**
    -   drivers: `ng-gateway-southward/*`
    -   plugins: `ng-gateway-northward/*`
-   **Build `ng-gateway-bin`**
-   **Deploy dynamic libraries by platform extension** to:
    -   `drivers/builtin/libng_driver_*.{so|dylib|dll}`
    -   `plugins/builtin/libng_plugin_*.{so|dylib|dll}`
-   **Optionally build UI**: Default builds `ng-gateway-ui/apps/web-antd` and packages as `ng-gateway-web/ui-dist.zip`

> Key Constraint: driver/plugin crate must configure `[lib] crate-type = ["cdylib", "rlib"]` in `Cargo.toml`, and crate name recommends following:
>
> -   driver: `ng-driver-xxx` → Artifact filename `libng_driver_xxx.*`
> -   plugin: `ng-plugin-yyy` → Artifact filename `libng_plugin_yyy.*`

### 5.3 How to debug only one driver/plugin?

Best Practice (Development Phase):

```bash
# 1) Build only the crate you want to change + main program (Faster)
cargo build -p ng-driver-modbus -p ng-gateway-bin

# 2) Deploy built dynamic library to builtin (Avoid manual path finding)
cargo xtask deploy --profile debug

# 3) Restart gateway process (Dynamic library loading happens at startup phase; replacing file during runtime not guaranteed to take effect)
./target/debug/ng-gateway-bin --config ./gateway.toml
```

> Note: `deploy` will copy all built `libng_driver_*`/`libng_plugin_*` by filename glob, so "Build one crate + deploy" can achieve "Replace only one dynamic library".
