---
title: 'OPC UA Security & Auth Best Practices'
description: 'How to choose SecurityPolicy/SecurityMode, how to configure Anonymous/UserPassword/Certificate authentication, and common handshake failure troubleshooting ideas.'
---

## 1) Understand First: Security Policy vs Security Mode

-   **SecurityPolicy**: Determines which encryption/signing algorithm suites to use (e.g., Basic256Sha256, Aes256Sha256RsaPss).
-   **SecurityMode**: Determines whether to sign/encrypt.
    -   None: No signing, no encryption.
    -   Sign: Only signing (Tamper-proof).
    -   SignAndEncrypt: Signing + Encryption (Tamper-proof + Confidentiality).

Production Environment Suggestion:

-   Prioritize **SignAndEncrypt**
-   At least **Sign**

## 2) Authentication Method Selection

Driver supports:

-   `anonymous`: Anonymous
-   `userPassword`: Username Password
-   `issuedToken`: Token String
-   `certificate`: Certificate (Private Key + Certificate)

Suggested Priority (General Industrial Site):

1.  Username Password (Low implementation cost)
2.  Certificate Authentication (Stronger security, but higher O&M complexity)

## 3) Key Points for Certificate Authentication Implementation

When using `certificate`:

-   `auth.privateKey`: Private key content (Usually PEM)
-   `auth.certificate`: Client certificate content (Usually PEM)

Common Process:

-   Generate client certificate (Self-signed or Enterprise CA signed)
-   "Trust this certificate" (or trust corresponding CA) in the Trust List on the Server side
-   Restart/Reload Server configuration

> Note: Trust chain mechanisms vary by Server, be sure to follow Server documentation.

## 4) Common Handshake Failure Troubleshooting

### 4.1 Endpoint Policy Mismatch

Phenomenon:

-   Can connect to `opc.tcp://...` but session creation fails.

Troubleshooting:

-   Use UA client tool to view endpoint list, confirm supported policy/mode combinations.
-   Driver configuration must be consistent with target endpoint.

### 4.2 Certificate Untrusted

Phenomenon:

-   `BadCertificateUntrusted` / `BadSecurityChecksFailed`

Troubleshooting:

-   Confirm Server has added client certificate to trust.
-   Confirm certificate chain (Intermediate CA) is complete.
-   Confirm client `applicationUri` matches URI/SubjectAltName constraints in certificate (Depends on Server strictness).

### 4.3 Username Password Error / Insufficient Permission

Phenomenon:

-   `BadUserAccessDenied` / `BadIdentityTokenRejected`

Troubleshooting:

-   Verify with same account in UA client tool.
-   Check Server user permissions: Whether read/write permission exists for that node.

## 5) Trade-off between Performance and Security

Encryption/Signing increases CPU overhead and handshake cost, but is usually "worth it":

-   If data frequency is extremely high and network isolation is reliable, evaluate `Sign` (No encryption) as a compromise.
-   If cross-segment, cross-public network, or multi-tenant scenarios exist, please insist on `SignAndEncrypt`.
