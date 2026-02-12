---
title: Source Build Installation
description: 'For secondary development and private deployment: Use cargo xtask to build gateway, drivers/plugins, and optionally package UI (filesystem / embedded_zip) with one click.'
---

# Source Build

## Applicable Scenarios

-   **Secondary Development**: Modify gateway core logic, drivers, plugins, or Web API and run self-compiled versions.
-   **Offline/Restricted Environment**: Cannot pull images directly or use external repositories.
-   **Controllable Delivery**: Wish to build own Releases, reproducible builds, controllable dependency versions.

## Key Concept: Runtime Directory (WorkingDirectory / runtime_dir)

NG Gateway's configuration, data, drivers, plugins, certificates, etc., are organized by default as relative paths to the "runtime root directory" (e.g., `./data`, `./drivers`, `./plugins`, `./certs`).

:::: tip Important Recommendation
**For local source code runtime**, please run the binary directly in the repository root directory (ensure relative paths like `./gateway.toml`, `./drivers`, `./plugins` are valid) to avoid the issue of "driver/plugin paths recorded in the database becoming invalid".
::::

## Prerequisites

### Essential Software

-   **Rust Toolchain**: Recommended to use `rustup` to install stable.
-   **Node.js + pnpm**
    -   Node Version: >=20.12.0
    -   pnpm Version: >=10.0.0

### System Dependencies

::: warning Note
The repository includes plugins like Kafka/Pulsar, and some dependencies will pull/compile native libraries (e.g., `libsasl2`, `libclang`, `protoc`).

**macOS (Homebrew)**:

```bash
brew update
brew install cmake pkg-config protobuf llvm cyrus-sasl
```

**Debian/Ubuntu**:

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

## 1. Get Source Code

```bash
git clone https://github.com/shiyuecamus/ng-gateway.git
cd ng-gateway
```

## 2. Build

This repository uses the **xtask pattern** to unify the build process:

-   Build gateway binary (`ng-gateway-bin`)
-   Build and deploy drivers (`drivers/builtin/`) and plugins (`plugins/builtin/`)
-   Build UI and package as `ng-gateway-web/ui-dist.zip`

### 2.1 Debug Build

```bash
cargo xtask build --profile debug
```

### 2.2 Release Build

```bash
cargo xtask build --profile release
```

### 2.3 Common Arguments

```bash
# Build backend only (skip UI build), suitable for environments without Node/pnpm
cargo xtask build --profile debug --without-ui

# Build gateway binary only (skip drivers/plugins discovery and deployment), suitable for certain packaging scenarios
cargo xtask build --profile release --bin-only

# Specify UI application (default web-antd)
cargo xtask build --profile debug --ui-app web-antd

# Pass through cargo build arguments (Note: arguments after -- will be passed to cargo build)
cargo xtask build --profile release -- --target x86_64-unknown-linux-gnu
```

## 3. Run

### 3.1 Run with Default Configuration (Recommended to run from repository root)

```bash
./target/debug/ng-gateway-bin --config ./gateway.toml
```

### 3.2 Run with Custom Configuration File

```bash
./target/release/ng-gateway-bin --config /path/to/gateway.toml
```

Environment variables can also be used:

```bash
export NG_CONFIG=/path/to/gateway.toml
./target/release/ng-gateway-bin
```

### 3.3 Health Check and Access Address

-   **Health Check**: `GET /health`
-   **API**: Default prefix is `/api` (see `[web].router_prefix` in `gateway.toml`)
-   **UI**: When `[web.ui].enabled=true`, UI is provided by the gateway process at `/`

Example:

```bash
curl -fsS "http://127.0.0.1:5678/health" && echo
```

## 4. Three Modes of UI

NG Gateway's UI can be selected in three modes according to the scenario (see `[web.ui]` in `gateway.toml`):

-   **filesystem (Recommended for Dev/Container all-in-one)**
    -   Gateway serves static files directly from `filesystem_root` (usually Vite's `dist/`).
-   **embedded_zip (Recommended for Single Binary Release)**
    -   UI is embedded in the binary as `ui-dist.zip` at compile time (suitable for Homebrew/Offline Single Machine Delivery).
-   **disabled (Pure Backend/Headless)**
    -   Completely disable UI static resource service.

:::: warning Dev Recommendation
When doing frontend development, do not frequently rebuild/pack UI; it is recommended to use **`pnpm dev:antd`** or **`pnpm dev:docs`** described in [`Local Development`](../dev/local-dev.md) for a faster experience and friendlier debugging.
::::

## 5. FAQ

### 5.1 Build Failure: Cannot find libsasl / libclang / protoc

-   Linux: Prioritize installing `libsasl2-dev`, `libclang-dev`, `protobuf-compiler` according to "System Dependencies (Debian/Ubuntu)" in this chapter.
-   macOS: Prioritize using `brew install protobuf llvm cyrus-sasl`.

### 5.2 UI 404 or Blank Page

Usually UI dist is not built or path is incorrect:

-   Check `gateway.toml`:
    -   `[web.ui].enabled=true`
    -   `[web.ui].mode="filesystem"`
    -   `[web.ui].filesystem_root` points to the real `dist/` directory.
-   Or verify by re-executing: `cargo xtask build --profile debug` (Builds UI by default).
