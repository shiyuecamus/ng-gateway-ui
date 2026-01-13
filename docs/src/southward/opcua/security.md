---
title: 'OPC UA 安全与认证最佳实践'
description: '如何选择 SecurityPolicy/SecurityMode，如何配置匿名/用户名密码/证书认证，以及常见握手失败排查思路。'
---

## 1) 先理解：安全策略 vs 安全模式

- **SecurityPolicy**：决定使用哪些加密/签名算法套件（如 Basic256Sha256、Aes256Sha256RsaPss）
- **SecurityMode**：决定是否签名/是否加密
  - None：不签名、不加密
  - Sign：只签名（防篡改）
  - SignAndEncrypt：签名+加密（防篡改+保密）

生产环境建议：

- 优先 **SignAndEncrypt**
- 至少 **Sign**

## 2) 认证方式选择

驱动支持：

- `anonymous`：匿名
- `userPassword`：用户名密码
- `issuedToken`：令牌字符串
- `certificate`：证书（私钥 + 证书）

建议优先级（一般工业现场）：

1. 用户名密码（落地成本低）
2. 证书认证（安全性更强，但运维复杂度更高）

## 3) 证书认证的落地要点

当使用 `certificate`：

- `auth.privateKey`：私钥内容（通常 PEM）
- `auth.certificate`：客户端证书内容（通常 PEM）

常见流程：

- 生成客户端证书（自签或企业 CA 签发）
- 在 Server 侧的 Trust List 中“信任该证书”（或信任对应 CA）
- 重启/重载 Server 配置

> 注意：不同 Server 的信任链机制不同，务必按 Server 文档操作。

## 4) 常见握手失败排查

### 4.1 Endpoint 策略不匹配

现象：

- 能连上 `opc.tcp://...` 但会话创建失败

排查：

- 用 UA 客户端工具查看 endpoint 列表，确认支持的 policy/mode 组合
- 驱动配置必须与目标 endpoint 一致

### 4.2 证书不被信任

现象：

- `BadCertificateUntrusted` / `BadSecurityChecksFailed`

排查：

- 确认 Server 已把客户端证书加入 trust
- 确认证书链（中间 CA）齐全
- 确认客户端 `applicationUri` 与证书中的 URI/SubjectAltName 约束是否匹配（取决于 Server 的严格程度）

### 4.3 用户名密码错误 / 权限不足

现象：

- `BadUserAccessDenied` / `BadIdentityTokenRejected`

排查：

- 在 UA 客户端工具里用相同账号验证
- 检查 Server 的用户权限：是否对该节点有 read/write 权限

## 5) 性能与安全的折中

加密/签名会增加 CPU 开销与握手成本，但通常“值得”：

- 如果数据频率极高且网络隔离可靠，可以评估 `Sign`（不加密）作为折中
- 如果存在跨网段、跨公网、或多租户场景，请坚持 `SignAndEncrypt`


