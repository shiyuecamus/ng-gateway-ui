---
title: 源码编译安装
description: 面向二次开发与私有化部署：使用 cargo xtask 一键构建网关、驱动/插件并可选打包 UI（filesystem / embedded）。
---

# 源码编译

## 适用场景

- **二次开发**：修改网关核心逻辑、驱动、插件或 Web API 后自编译运行
- **离线/受限环境**：无法直接拉取镜像或使用外部仓库
- **可控交付**：希望自建 Release、可复现构建、可控依赖版本

## 关键概念：运行时目录（WorkingDirectory / runtime_dir）

NG Gateway 的配置、数据、驱动、插件、证书等默认以“运行时根目录”的相对路径组织（例如 `./data`、`./drivers`、`./plugins`、`./certs`）。

:::: tip 重要建议 **本地源码运行时**，请直接在仓库根目录运行二进制（确保 `./gateway.toml`、`./drivers`、`./plugins` 的相对路径成立），避免出现“数据库里记录的 driver/plugin 路径失效”的问题。::::

## 前置条件

### 必备软件

- **Rust 工具链**：建议使用 `rustup` 安装 stable
- **Node.js + pnpm**
  - Node 版本：>=20.12.0
  - pnpm 版本：>=10.0.0

### 系统依赖

::: warning 说明仓库包含 Kafka/Pulsar 等插件，部分依赖会拉取/编译原生库（例如 `libsasl2`、`libclang`、`protoc`）。

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
- 构建 UI 并打包为 `ng-gateway-web/ui-dist`

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
cohort="$(cargo xtask cohort-dir --profile debug)" &&
  "$cohort/ng-gateway-bin" --config ./gateway.toml
```

### 3.2 使用自定义配置文件

```bash
cohort="$(cargo xtask cohort-dir --profile release)" &&
  "$cohort/ng-gateway-bin" --config /path/to/gateway.toml
```

构建使用 `--target` 时，解析目录也传入同一个 `--target`。查找 `--bin-only` 的制品时，为 `cohort-dir` 加上 `--bin-only`。

也可以使用环境变量：

```bash
export NG_CONFIG=/path/to/gateway.toml
cohort="$(cargo xtask cohort-dir --profile release)" &&
  "$cohort/ng-gateway-bin"
```

### 3.3 健康检查与访问地址

- **健康检查**：`GET /health`
- **API**：默认前缀为 `/api`（见 `gateway.toml` 的 `[web].router_prefix`）
- **UI**：当 `[web.ui].enabled=true` 时，UI 由网关进程在 `/` 提供

示例：

```bash
curl -fsS "http://127.0.0.1:5678/health" && echo
```

## 4. UI 的两种来源与纯后端开关

NG Gateway 的 UI 可以按场景选择两种资源来源或关闭 UI（见 `gateway.toml` 的 `[web.ui]`）：

- **filesystem（开发/容器 all-in-one 推荐）**
  - 网关在监听前从 `filesystem_root` 指向的 V2 store 校验并准备不可变资源快照；请求不再访问磁盘
- **embedded（单二进制发行推荐）**
  - 完整 UI 文件树先按内容身份发布到 `ui-dist/objects/<ID>/`，再在编译期直接嵌入二进制（适合 Homebrew/离线单机交付）
- **enabled=false（纯后端/Headless）**
  - 完全关闭 UI 静态资源服务

:::: warning 研发建议做前端开发时，不要频繁 rebuild/pack UI；建议使用 [`本地开发`](../dev/local-dev.md) 里描述的 **`pnpm dev:antd`** 或 **`pnpm dev:docs`**，体验更快、调试更友好。::::

## 5. 常见问题

### 5.1 构建失败：找不到 libsasl / libclang / protoc

- Linux：优先按本章“系统依赖（Debian/Ubuntu）”安装 `libsasl2-dev`、`libclang-dev`、`protobuf-compiler`
- macOS：优先使用 `brew install protobuf llvm cyrus-sasl`

### 5.2 UI 404 或空白页

通常是 UI dist 没构建或路径不对：

- 确认 `gateway.toml`：
  - `[web.ui].enabled=true`
  - `[web.ui].mode="filesystem"`
  - `[web.ui].filesystem_root` 指向 `cargo xtask stage-ui` 产生的 store 根目录（默认 `./ng-gateway-web/ui-dist`）
- 或者直接重新执行：`cargo xtask build --profile debug`（默认会构建 UI）

## UI 构建产物契约

`embedded` 使用完整、已验证的公开目录树。先结束 Vite 构建，再执行发布；发布期间不要修改输入目录。`filesystem` 使用配置的 `filesystem_root`。纯后端使用 `[web.ui] enabled=false`；省略该配置时默认关闭 UI，发行包的配置显式启用它。

```bash
# 只发布已完成的前端目录，不构建或部署网关、驱动和插件。
cargo xtask stage-ui --dist-dir ng-gateway-ui/apps/web-antd/dist --out-dir ng-gateway-web/ui-dist
# 完整验证 CURRENT 选择的文件集合及内容身份。
cargo xtask verify-ui --dir ng-gateway-web/ui-dist
# 编译单二进制嵌入资源。此命令本身不执行部署。
cargo build --locked -p ng-gateway-bin --features ng-gateway-bin/ui-embedded
```

store 包含 `OWNER`、`CURRENT` 和 `objects/<ID>/`。ID 覆盖排序后的 UTF-8 路径、内容长度、SHA256 和文件数；mtime 不作为内容身份。旧对象保留，no-op 发布不重写选择。所有公开资源必须是普通文件，必须有 `index.html`；symlink、非普通文件、不合法路径和越界被拒绝。输入隐藏项不发布，已封存对象出现隐藏项则校验失败。只在停止全部使用该 store 的构建后才能人工清理旧对象，不能在编译期间改写或删除对象。

发布先同步完整对象和目录，最后原子切换 CURRENT。切换前失败保留原选择；`CommitUncertain` 表示新选择已可见但最终目录同步失败，保留报错中的 ID 与原始原因，再运行相同发布命令完整校验并同步。不要通过覆盖旧对象来“修复”失败。锁被占用时直接拒绝发布，锁持有者退出后可重试。

嵌入库直接引用已验证的 immutable object，运行时不解压 UI。缺少 store 会形成明确 unavailable 编译输入；运行时启用 `embedded` 必须具备完整 UI。损坏的 store 在构建时失败，不能降为“无 UI”。容器 `/app/ui` 的 filesystem 交付与该编译输入分开配置。

以下是新定义的**构建期变量**，producer 和 verifier 采用同一策略，不属于运行时 Settings：

| 变量 | 默认值 | 含义 |
| --- | --: | --- |
| `NG_UI_BUILD_MAX_ENTRIES` | 20000 | 遍历文件与目录总项数，包括排除的隐藏项 |
| `NG_UI_BUILD_MAX_ASSET_BYTES` | 33554432 | 单个公开文件字节上限 |
| `NG_UI_BUILD_MAX_CONTENT_BYTES` | 268435456 | 完整公开内容总字节上限 |
| `NG_UI_BUILD_MAX_PATH_BYTES` | 1024 | 相对 UTF-8 键字节上限 |
| `NG_UI_BUILD_MAX_DEPTH` | 32 | 根目录下的目录深度上限 |
| `NG_UI_BUILD_MAX_MANIFEST_BYTES` | 33554432 | 完整 JSONL manifest 编码字节上限 |
| `NG_UI_ARTIFACT_STORE` | `ng-gateway-web/ui-dist` | 直接 Cargo 构建的选择输入；相对路径按 workspace 根解析 |
| `NG_UI_ARTIFACT_TREE` | 未指定时选CURRENT | 精确64位小写hex身份或unavailable；xtask自动冻结并传递 |

`cargo xtask build --ui-out-dir <store>` 将实际 producer 和 Cargo consumer 绑定到同一 store，并将已验证 tree ID 写入该次宿主／插件共享构建 context。使用 cross 时输入必须在挂载的 workspace 内，自动传相对路径；外部绝对 store 会被拒绝。直接 Cargo 构建可显式设置 `NG_UI_ARTIFACT_STORE`，六个限额和选择变量都触发 Cargo 输入重检。嵌入资源的合成时间戳不能用作真实 HTTP Last-Modified。

运行期覆盖使用 `NG__WEB__UI__ENABLED`、`NG__WEB__UI__MODE`、`NG__WEB__UI__FILESYSTEM_ROOT`，前缀和每层之间均为双下划线。切换资源来源或配置后重启网关。旧 ZIP 模式及 disabled 模式没有兼容别名。

xtask 在读取共享 context 时冻结 tree ID；即使之后 CURRENT 换代，Web 编译仍完整校验并嵌入原 ID 的对象。直接 Cargo 未提供 ID 时才选择一次当前对象；选择变量同样触发 Cargo 重检。

当前 store 要求 V2 OWNER 和 `manifests/<ID>.jsonl`：有界 header 之后逐行记录有序文件。完整 payload 和 manifest 均校验通过后才能切换 CURRENT；V1 store 会被拒绝，应在新的受控输出目录重新构建产物。manifest 位于公开嵌入对象树之外，内容 tree ID 继续使用原版本一 framing。

## 不可变资源准备策略

两种 UI 来源均在监听前准备完整不可变资源。文件修改和 CURRENT 换代在重启网关后生效；启用但缺失、损坏、超时或额度不足会使启动失败。尚未退出的 I/O 保留原准入，直到真实 worker 和结果退出。运行期限额放在 `[web.ui.limits]`（或 `NG__WEB__UI__LIMITS__...`）：

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
