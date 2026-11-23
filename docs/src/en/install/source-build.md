---
title: Source Build Installation
description: 'For secondary development and private deployment: Use cargo xtask to build gateway, drivers/plugins, and optionally package UI (filesystem / embedded) with one click.'
---

# Source Build

## Applicable Scenarios

- **Secondary Development**: Modify gateway core logic, drivers, plugins, or Web API and run self-compiled versions.
- **Offline/Restricted Environment**: Cannot pull images directly or use external repositories.
- **Controllable Delivery**: Wish to build own Releases, reproducible builds, controllable dependency versions.

## Key Concept: Runtime Directory (WorkingDirectory / runtime_dir)

NG Gateway's configuration, data, drivers, plugins, certificates, etc., are organized by default as relative paths to the "runtime root directory" (e.g., `./data`, `./drivers`, `./plugins`, `./certs`).

:::: tip Important Recommendation **For local source code runtime**, please run the binary directly in the repository root directory (ensure relative paths like `./gateway.toml`, `./drivers`, `./plugins` are valid) to avoid the issue of "driver/plugin paths recorded in the database becoming invalid". ::::

## Prerequisites

### Essential Software

- **Rust Toolchain**: Recommended to use `rustup` to install stable.
- **Node.js + pnpm**
  - Node Version: >=20.12.0
  - pnpm Version: >=10.0.0

### System Dependencies

::: warning Note The repository includes plugins like Kafka/Pulsar, and some dependencies will pull/compile native libraries (e.g., `libsasl2`, `libclang`, `protoc`).

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

- Build gateway binary (`ng-gateway-bin`)
- Build and deploy drivers (`drivers/builtin/`) and plugins (`plugins/builtin/`)
- Build UI and package as `ng-gateway-web/ui-dist`

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
cohort="$(cargo xtask cohort-dir --profile debug)" &&
  "$cohort/ng-gateway-bin" --config ./gateway.toml
```

### 3.2 Run with Custom Configuration File

```bash
cohort="$(cargo xtask cohort-dir --profile release)" &&
  "$cohort/ng-gateway-bin" --config /path/to/gateway.toml
```

Pass the same `--target` to `cohort-dir` if you selected a target when building. Add `--bin-only` to resolve a host-only build.

Environment variables can also be used:

```bash
export NG_CONFIG=/path/to/gateway.toml
cohort="$(cargo xtask cohort-dir --profile release)" &&
  "$cohort/ng-gateway-bin"
```

### 3.3 Health Check and Access Address

- **Health Check**: `GET /health`
- **API**: Default prefix is `/api` (see `[web].router_prefix` in `gateway.toml`)
- **UI**: When `[web.ui].enabled=true`, UI is provided by the gateway process at `/`

Example:

```bash
curl -fsS "http://127.0.0.1:5678/health" && echo
```

## 4. UI Sources and Headless Operation

NG Gateway's UI has two resource sources and a separate enabled switch according to the scenario (see `[web.ui]` in `gateway.toml`):

- **filesystem (Recommended for Dev/Container all-in-one)**
  - Before listening, the gateway verifies and prepares an immutable snapshot from the V2 store at `filesystem_root`; requests do not access disk.
- **embedded (Recommended for Single Binary Release)**
  - The verified `ui-dist/objects/<ID>/` public file tree is embedded directly at compile time (suitable for Homebrew/Offline Single Machine Delivery).
- **enabled=false (Pure Backend/Headless)**
  - Completely disable UI static resource service.

:::: warning Dev Recommendation When doing frontend development, do not frequently rebuild/pack UI; it is recommended to use **`pnpm dev:antd`** or **`pnpm dev:docs`** described in [`Local Development`](../dev/local-dev.md) for a faster experience and friendlier debugging. ::::

## 5. FAQ

### 5.1 Build Failure: Cannot find libsasl / libclang / protoc

- Linux: Prioritize installing `libsasl2-dev`, `libclang-dev`, `protobuf-compiler` according to "System Dependencies (Debian/Ubuntu)" in this chapter.
- macOS: Prioritize using `brew install protobuf llvm cyrus-sasl`.

### 5.2 UI 404 or Blank Page

Usually UI dist is not built or path is incorrect:

- Check `gateway.toml`:
  - `[web.ui].enabled=true`
  - `[web.ui].mode="filesystem"`
  - `[web.ui].filesystem_root` points to the store produced by `cargo xtask stage-ui` (default `./ng-gateway-web/ui-dist`).
- Or verify by re-executing: `cargo xtask build --profile debug` (Builds UI by default).

## UI build artifact contract

`embedded` selects a complete verified public file tree. Finish the Vite build before publishing and keep its input directory quiescent during publication. `filesystem` selects `filesystem_root`. Headless operation uses `[web.ui] enabled=false`; UI is disabled when omitted, while distribution configurations enable it explicitly.

```bash
# Publish completed frontend output without building or deploying gateway components.
cargo xtask stage-ui --dist-dir ng-gateway-ui/apps/web-antd/dist --out-dir ng-gateway-web/ui-dist
# Verify the complete selected file set and content identity.
cargo xtask verify-ui --dir ng-gateway-web/ui-dist
# Compile embedded resources without deploying drivers or plugins.
cargo build --locked -p ng-gateway-bin --features ng-gateway-bin/ui-embedded
```

The store contains `OWNER`, `CURRENT`, and `objects/<ID>/`. Identity covers sorted UTF-8 paths, lengths, SHA256 content digests, and the file count; timestamps do not define identity. Old objects remain, and a no-op publication leaves the selection untouched. Public entries must be regular files and include `index.html`. Symlinks, special files, invalid paths, and exceeded limits fail closed. Hidden input entries are excluded; hidden entries in sealed objects are rejected. Stop every build using a store before manually removing old objects; never modify or remove objects during compilation.

Publication synchronizes object files and directories before atomically replacing CURRENT. Earlier failures preserve the previous selection. `CommitUncertain` means replacement is visible but final directory synchronization failed: retain its ID and original cause, then repeat publication to verify and synchronize it again. Never overwrite an old object to repair a failure. A held publisher lock rejects publication until its owner exits.

The embedding library references the verified immutable object directly; runtime UI decompression is removed. A missing store creates an explicit unavailable compile input, and enabling embedded UI at runtime requires complete assets. A corrupt store fails the build rather than silently becoming unavailable. Filesystem delivery at container path `/app/ui` is configured separately.

These newly defined **build variables** govern both producer and verifier; they are separate from runtime Settings:

| Variable | Default | Meaning |
| --- | --: | --- |
| `NG_UI_BUILD_MAX_ENTRIES` | 20000 | Visited files and directories, including excluded hidden entries |
| `NG_UI_BUILD_MAX_ASSET_BYTES` | 33554432 | Maximum individual public file bytes |
| `NG_UI_BUILD_MAX_CONTENT_BYTES` | 268435456 | Maximum total public content bytes |
| `NG_UI_BUILD_MAX_PATH_BYTES` | 1024 | Maximum relative UTF-8 key bytes |
| `NG_UI_BUILD_MAX_DEPTH` | 32 | Maximum directory depth below the root |
| `NG_UI_BUILD_MAX_MANIFEST_BYTES` | 33554432 | Maximum complete encoded JSONL manifest bytes |
| `NG_UI_ARTIFACT_STORE` | `ng-gateway-web/ui-dist` | Selected direct Cargo input; relative paths use the workspace root |
| `NG_UI_ARTIFACT_TREE` | CURRENT if omitted | Exact lowercase 64-hex identity or unavailable; xtask freezes and supplies it |

`cargo xtask build --ui-out-dir <store>` binds its producer and Cargo consumer to the same store and records the verified tree ID in the shared host/plugin build context. Cross builds require a store inside the mounted workspace and pass a relative path; external stores are rejected. Direct Cargo builds may set `NG_UI_ARTIFACT_STORE`. Cargo tracks the selection variable and all six limits. Synthetic embedded timestamps must not be presented as real HTTP Last-Modified times.

Runtime overrides are `NG__WEB__UI__ENABLED`, `NG__WEB__UI__MODE`, and `NG__WEB__UI__FILESYSTEM_ROOT`, with double underscores after the prefix and between segments. Restart the gateway after changing the source or configuration. The retired ZIP mode and disabled mode have no compatibility aliases.

xtask freezes the tree ID when reading the shared context. Later CURRENT changes cannot switch Web compilation to a different object. Direct Cargo selects the current object only when no ID is supplied; Cargo tracks the identity variable too.

The current store requires the V2 OWNER marker and `manifests/<ID>.jsonl`: one bounded header followed by ordered file records. Both payload and manifest must be complete and verified before CURRENT is selected. V1 stores are rejected; rebuild an artifact in a new owned output directory. Manifests remain outside the public embedded object tree. The content tree ID retains its version-one framing.

## Immutable resource preparation policy

Both UI sources prepare a complete immutable resource set before the listener is activated. Filesystem changes and a new CURRENT selection take effect on gateway restart. An enabled source that is missing, corrupt, expired or over quota fails startup. Pending I/O retains its original admission until the real worker and result retire. Set these runtime bounds under `[web.ui.limits]` (or `NG__WEB__UI__LIMITS__...`):

| Field                          |    Default |
| ------------------------------ | ---------: |
| `max_files`                    |      20000 |
| `max_asset_bytes`              |   33554432 |
| `max_content_bytes`            |  268435456 |
| `max_retained_bytes`           |  402653184 |
| `max_manifest_bytes`           |   33554432 |
| `max_path_bytes`               |       1024 |
| `max_depth`                    |         32 |
| `prepare_timeout_ms`           |      30000 |
| `max_work_bytes`               | 1073741824 |
| `native_worker_bytes`          |    4194304 |
| `max_request_path_bytes`       |       8192 |
| `max_conditional_header_bytes` |       8192 |
| `max_range_header_bytes`       |       2048 |
| `max_ranges`                   |         16 |
| `max_response_metadata_bytes`  |      16384 |
| `request_timeout_ms`           |       1000 |
