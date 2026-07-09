<!-- TEMPLATE: design-security.md — 安全设计模板 -->
<!-- 用途：new-plan 生成安全设计子文档，描述威胁模型、认证授权、数据保护与审计 -->
<!-- 位置：docs/plans/P{NNN}-{slug}/design-security.md -->
<!-- AI 生成指引：从 requirements 的功能边界推导攻击面，从 domain-model 推导权限域，从 deployment 推导传输安全需求 -->

# Design: 安全设计

> 子文档 of [design.md](design.md) | 本文档描述系统安全架构：威胁建模、认证授权、数据保护与运维安全

## 威胁模型

<!-- AI 生成指引：用 STRIDE 方法论对系统的主要资产和交互边界进行分析 -->

### 核心资产

| 资产 | 敏感等级 | 受影响的合规要求 | 说明 |
|------|---------|----------------|------|
| 用户密码 / 凭证 | 极高 | GDPR / SOC2 | 泄露 = 账号接管 |
| PII 数据（姓名、邮箱、手机号） | 高 | GDPR / PIPL | {说明} |
| 业务核心数据 | 高 | {合规标准} | {说明} |
| 日志 / 审计记录 | 中 | SOC2 | 不可篡改 |
| 配置信息 | 中 | 无 | 不含密钥 |

### STRIDE 分析

| 威胁类别 | 威胁描述 | 受影响资产 | 概率 | 影响 | 缓解措施 |
|---------|---------|-----------|------|------|---------|
| **S**poofing | 伪造身份访问 API | 用户数据 | {中/高/低} | {高/中/低} | JWT+签名验证 / mTLS |
| **T**ampering | 篡改请求参数绕过权限 | 业务数据 | {概率} | {影响} | 输入验证 / 完整性校验 |
| **R**epudiation | 否认执行关键操作 | 审计记录 | {概率} | {影响} | 审计日志 / 数字签名 |
| **I**nformation Disclosure | 日志泄露敏感信息 | PII | {概率} | {影响} | 日志脱敏 / 最小权限 |
| **D**enial of Service | API 高频调用耗尽资源 | 可用性 | {概率} | {影响} | 限流 / WAF / CDN |
| **E**levation of Privilege | 越权访问其他用户数据 | 用户数据 | {概率} | {影响} | RBAC / 行级权限 |

## 认证设计

<!-- AI 生成指引：根据项目用户类型选择认证方式。内部工具→SSO，公开 SaaS→OAuth2+本地 -->

### 认证方式

| 认证方式 | 适用场景 | 标准/协议 | 库/服务 | 说明 |
|---------|---------|----------|--------|------|
| 密码登录 | 本地账号 | bcrypt / argon2 | {库名} | 密码强度要求: {规则} |
| OAuth2 / OIDC | 社交登录/单点登录 | RFC 6749 | {库/服务} | 支持 providers: {列表} |
| SSO / SAML | 企业用户 | SAML 2.0 | {服务} | IdP: {provider} |
| MFA / TOTP | 高安全场景 | RFC 6238 | {库} | {强制/可选} |
| API Key / Token | 机器间调用 | 自定义 Header | — | 仅限内部服务 |

### 密码策略

| 策略项 | 值 | 说明 |
|--------|-----|------|
| 哈希算法 | bcrypt (cost=12) / argon2id | 禁止 MD5/SHA1/SHA256 |
| 最小长度 | {N} 字符 | {依据} |
| 复杂度要求 | {大写+小写+数字+特殊字符 选 N 项} | {说明} |
| 历史检查 | 最近 {N} 次不可重复 | 防止密码循环 |
| 失败锁定 | {N} 次失败锁定 {M} 分钟 | 防暴力破解 |
| 过期策略 | {N} 天 / 不强制过期 | {依据} |

### 会话管理

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 会话存储 | Redis / 无状态 JWT | {选择原因} |
| 会话超时 | {N} 分钟（空闲）/ {M} 分钟（绝对） | {依据} |
| 并发会话数 | {N} 个 / 不限 | 超过最旧会话失效 |
| 令牌刷新 | Refresh Token 轮换 (RTR) | 每次刷新换新 token |
| 登出行为 | 服务端失效 + 客户端清除 | 两端同时失效 |

### Token 设计

```json
{
  "sub": "{user_id}",
  "iss": "{issuer_url}",
  "aud": ["{audience}"],
  "iat": 1718000000,
  "exp": 1718003600,
  "jti": "{unique_token_id}",
  "roles": ["{role_name}"],
  "perms": ["{permission_key}"]
}
```

| 配置项 | 值 |
|--------|-----|
| 签名算法 | RS256 / ES256 |
| Access Token 有效期 | {N} 分钟 |
| Refresh Token 有效期 | {N} 天 |
| 密钥轮换周期 | {N} 天 |

## 授权设计

### 授权模型

<!-- AI 生成指引：简单场景用 RBAC，复杂场景（属性级/资源级）用 ABAC 或混合 -->

**选择**：{RBAC / ABAC / RBAC+ABAC 混合}

**选择理由**：<!-- 1-2 句说明 -->

### 角色定义

| 角色 | 继承 | 描述 | 适用范围 |
|------|------|------|---------|
| `ROLE_SUPER_ADMIN` | — | 超级管理员 | 全部租户 |
| `ROLE_ADMIN` | — | {租户/项目}管理员 | 当前 {scope} |
| `ROLE_{DOMAIN}_EDITOR` | `ROLE_{DOMAIN}_VIEWER` | {领域}编辑者 | {scope} |
| `ROLE_{DOMAIN}_VIEWER` | — | {领域}只读用户 | {scope} |
| `ROLE_ANONYMOUS` | — | 未登录用户 | 公开接口 |

### 权限矩阵

<!-- AI 生成指引：行=角色，列=操作。对于 ABAC 额外标注属性条件。 -->

| 操作 \ 角色 | SUPER_ADMIN | ADMIN | EDITOR | VIEWER | ANONYMOUS | 属性条件 |
|-------------|-------------|-------|--------|--------|-----------|---------|
| `{resource}:create` | Y | Y | Y | N | N | — |
| `{resource}:read` | Y (all) | Y (scope) | Y (scope) | Y (scope) | N | owner_id=self (VIEWER) |
| `{resource}:update` | Y | Y (scope) | Y (scope) | N | N | owner_id=self (EDITOR) |
| `{resource}:delete` | Y | Y (scope) | N | N | N | — |
| `admin:users` | Y | Y (scope) | N | N | N | — |
| `admin:audit` | Y | N | N | N | N | — |

### 策略执行点

| 执行层 | 位置 | 机制 | 说明 |
|--------|------|------|------|
| API Gateway | {gateway} | JWT 验证 + 路由级权限 | 拦截未认证请求 |
| 应用层 | Controller / Middleware | 声明式注解 `@PreAuthorize` | 接口级鉴权 |
| 领域层 | Service 层 | 编程式检查 | 业务规则级鉴权 |
| 数据层 | Repository / DB | 行级安全策略 (RLS) | 最细粒度数据隔离 |

## API 安全

### 输入验证策略

| 验证层 | 时机 | 规则 | 拒绝行为 |
|--------|------|------|---------|
| 网关 | 路由匹配后 | 参数类型/格式/长度 | 400 Bad Request |
| Controller | 请求绑定后 | DTO 校验 (`@Valid`) | 400 + 错误详情 |
| 领域层 | 业务逻辑前 | 业务规则不变量 | 抛出 DomainException |
| 持久化层 | 写入前 | 列约束 / CHECK | DatabaseException |

<!-- AI 生成指引：所有外部输入必须经过三层验证：Transport（格式）→ Business（规则）→ Persistence（约束） -->

### 限流策略

| 端点分组 | 策略 | 阈值 | 时间窗口 | 超限响应 |
|---------|------|------|---------|---------|
| 认证接口 (/auth/*) | IP 限流 | {N} 次 | 1 分钟 | 429 + Retry-After |
| 公共 API | IP + Token | {M} 次 | 1 分钟 | 429 |
| 管理 API | User 级 | {P} 次 | 1 秒 | 429 |
| 全局 | 服务级 | {Q} 次 | 1 秒 | 503 (熔断) |

### CORS 配置

```yaml
cors:
  allowedOrigins: [{生产域名列表}]
  allowedMethods: [GET, POST, PUT, DELETE, OPTIONS]
  allowedHeaders: [Authorization, Content-Type, X-Request-Id]
  exposedHeaders: [X-Request-Id, X-RateLimit-Remaining]
  allowCredentials: true
  maxAge: 3600
```

### CSRF 保护

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 策略 | SameSite Cookie / CSRF Token / Header 检查 | {选择理由} |
| 豁免路径 | /api/* (API 使用 Bearer Token) | API 端点的 Authorization header 已防 CSRF |
| Cookie SameSite | Strict / Lax | {选择理由} |

## 数据保护

### 加密方案

| 场景 | 算法 | 密钥长度 | 密钥管理 | 说明 |
|------|------|---------|---------|------|
| 传输加密 | TLS 1.3 (min 1.2) | — | 证书自动续期 (Let's Encrypt / cert-manager) | 全链路 HTTPS |
| 密码存储 | bcrypt (cost=12) / argon2id | — | — | 单向哈希 |
| 敏感字段加密 | AES-256-GCM | 256 bit | {Vault/KMS/HSM} | 需搜索的字段用盲索引 |
| PII 脱敏显示 | — | — | — | 手机号: `138****1234` |
| 数据备份加密 | AES-256-CBC | 256 bit | KMS 包装密钥 | 离线备份加密 |

### PII 处理

| PII 类型 | 存储加密 | 日志脱敏 | API 响应脱敏 | 保留周期 |
|---------|---------|---------|------------|---------|
| 姓名 | 可搜索加密 | 脱敏 | 完整 | 账号存续 + {N} 天 |
| 邮箱 | 可搜索加密 | 脱敏 | 脱敏 (`te***@domain.com`) | 同上 |
| 手机号 | 可搜索加密 | 脱敏 | 脱敏 (`138****1234`) | 同上 |
| IP 地址 | 不加密 | 脱敏末段 | 不返回 | {N} 天 |
| 身份证号 | AES-256-GCM | 不记录 | 不返回 | 按合规要求 |

### 数据脱敏规则

| 数据类型 | 脱敏函数 | 示例 |
|---------|---------|------|
| 手机号 | maskMiddle(3,4) | 138****1234 |
| 邮箱 | maskEmail() | t***@domain.com |
| 身份证 | maskMiddle(3,12) | 310*************1X |
| 银行卡号 | showLast(4) | ****1234 |
| 姓名 | showFirst(1) | 张** |

## 密钥管理

<!-- AI 生成指引：生产环境禁止使用配置文件/环境变量存储密钥 -->

| 密钥类型 | 存储位置 | 轮换周期 | 轮换方式 | 回退策略 |
|---------|---------|---------|---------|---------|
| 数据库密码 | {Vault/HashiCorp Vault/AWS Secrets Manager} | {N} 天 | 双密码过渡 | 保留旧密码 {N} 小时 |
| JWT 签名密钥 | {Vault/KMS} | {N} 天 | 双密钥 (kid) | 旧密钥验证保留 {N} 天 |
| API Key (第三方) | {Vault} | {N} 天 | 手动轮换 | 双 Key 过渡 |
| TLS 证书 | cert-manager | 90 天 | 自动续期 | — |
| 加密密钥 (DEK) | KMS 包装 | {N} 天 | 密钥版本化 | 保留上 {N} 代 |

### 密钥生命周期

```
  生成 ──▶ 激活 ──▶ 轮换 ──▶ 废弃（仅解密）──▶ 删除（不可恢复）
  │                │
  └── 加密备份 ────┘
```

## 审计日志

<!-- AI 生成指引：审计日志要回答 "who did what, when, from where, with what result" -->

### 审计事件

| 事件类型 | 必记录字段 | 示例 |
|---------|-----------|------|
| 认证 | user_id, ip, user_agent, result, timestamp | 登录成功/失败、MFA 挑战 |
| 授权变更 | actor_id, target_user_id, old_role, new_role, timestamp | 角色提权 |
| 数据操作 | user_id, action, resource_type, resource_id, diff | 删除/修改核心数据 |
| 敏感数据访问 | user_id, data_type, data_id, reason, timestamp | 查看 PII |
| 配置变更 | actor_id, key, old_value, new_value, timestamp | 修改限流/IP白名单 |
| 密钥访问 | actor_id, key_name, action, timestamp | 读取密钥 |

### 日志格式

```json
{
  "id": "{uuid}",
  "timestamp": "2026-01-15T10:30:00.000Z",
  "event": "user.login.failed",
  "actor": {"type": "user", "id": "u_123", "name": "zhangsan"},
  "target": {"type": "user", "id": "u_123"},
  "outcome": "failure",
  "reason": "invalid_password",
  "request": {
    "ip": "1.2.3.4",
    "user_agent": "Mozilla/5.0 ...",
    "method": "POST",
    "path": "/api/auth/login",
    "trace_id": "{trace_id}"
  },
  "detail": {
    "attempt": 3,
    "locked_until": "2026-01-15T11:00:00.000Z"
  }
}
```

### 审计存储

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 存储引擎 | {Elasticsearch / 专用审计 DB / 对象存储} | 与业务库隔离 |
| 保留周期 | {N} 天热 + {M} 天冷 | {合规: SOC2 要求至少 90 天} |
| 防篡改 | 哈希链 / 只追加日志 / WORM 存储 | 防止日志被删除 |
| 访问控制 | 仅安全团队可读，所有角色不可写 | RBAC 保护 |

## 安全头部与 TLS

### 安全头部

```yaml
securityHeaders:
  Content-Security-Policy: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
  Strict-Transport-Security: "max-age=63072000; includeSubDomains; preload"
  X-Content-Type-Options: "nosniff"
  X-Frame-Options: "DENY"
  X-XSS-Protection: "0"                          # 已废弃，依赖 CSP
  Referrer-Policy: "strict-origin-when-cross-origin"
  Permissions-Policy: "camera=(), microphone=(), geolocation=()"
```

### TLS 配置

| 配置项 | 值 |
|--------|-----|
| 最低 TLS 版本 | 1.2 (强烈建议 1.3) |
| 禁用加密套件 | RC4, 3DES, NULL, EXPORT, MD5-based |
| 推荐套件 | ECDHE+AESGCM, ECDHE+CHACHA20 |
| 证书类型 | ECDSA P-256 / RSA 2048+ |
| HSTS 预加载 | 生产环境启用 |

## 依赖漏洞扫描

| 工具/服务 | 频率 | 策略 | 处理流程 |
|----------|------|------|---------|
| {Dependabot / Snyk / Trivy / OWASP Dependency-Check} | 每次 PR / 每日 | Critical/High → 阻止合并 | 创建修复 PR → 测试 → 合并 |
| 容器镜像扫描 | 每次构建 | Critical → 阻止部署 | 更新基础镜像 → 重新构建 |
| SAST | 每次 PR | 阻止 High+ 引入 | 修复 → 重新扫描 |

## 安全响应

<!-- AI 生成指引：定义从发现到修复的完整流程 -->

### 告警渠道

| 级别 | 通知方式 | 响应 SLA | 升级条件 |
|------|---------|---------|---------|
| P0 (Critical) | 电话 + IM + 邮件 | {N} 分钟响应 | {M} 分钟未确认 → 升级 |
| P1 (High) | IM + 邮件 | {N} 分钟响应 | {M} 分钟未确认 → P0 |
| P2 (Medium) | 邮件 | {N} 小时响应 | 下次站会 |
| P3 (Low) | 工单 | 下次迭代 | — |

### 事件响应检查清单

```
[ ] 1. 确认与分类 — 验证事件真实性，评估影响范围
[ ] 2. 遏制 — 隔离受影响系统、吊销泄露密钥、切断攻击路径
[ ] 3. 取证 — 保留日志/快照/内存 dump，不修改现场
[ ] 4. 根因分析 — 攻击入口、利用链、时间线
[ ] 5. 修复 — 修复漏洞、轮换密钥、加固配置
[ ] 6. 恢复 — 灰度恢复服务、持续监控
[ ] 7. 复盘 — 5 Why、改进措施、更新安全策略
[ ] 8. 通知 — 通知受影响用户、监管机构（按合规要求时限）
```

## Status: draft
