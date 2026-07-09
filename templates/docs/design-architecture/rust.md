<!-- TEMPLATE: rust.md — Rust 项目架构设计模板 -->
<!-- 用途：l-feature / l-bugfix 的 design-architecture 子文档 -->
<!-- 位置：docs/plans/P{NNN}-{slug}/design-architecture.md -->
<!-- AI 生成指引：从 tech-stack.md 和 language-profile 推导，按以下结构完整填写 -->

# Design: 项目架构 (Rust)

> 子文档 of [design.md](design.md) | 本文档描述 Rust 项目的架构设计

## Rust Edition & Toolchain

<!-- AI 生成指引：从 Cargo.toml edition 字段和 rust-toolchain.toml 推导 -->
- **Edition**: `{2021|2024}`
- **Toolchain**: `{stable|nightly (feature: {specific-nightly-feature})}`
- **Minimum Supported Rust Version (MSRV)**: `{1.75+}` (CI 中验证)
- **Nightly 特性 (如使用)**: 仅用于 `rustfmt` 不稳定选项 / 特定宏；生产编译用 stable

## Cargo Workspace

<!-- AI 生成指引：从 Cargo.toml [workspace] 和成员 crate 推导 -->
```toml
# Cargo.toml (workspace root)
[workspace]
resolver = "2"
members = [
    "crates/api-server",
    "crates/domain",
    "crates/infrastructure",
    "crates/shared",
]

[workspace.dependencies]
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.8", features = ["runtime-tokio", "tls-rustls", "postgres"] }
serde = { version = "1", features = ["derive"] }
tracing = "0.1"
```
- **Feature flags**: `default = []` 最小默认依赖；按需启用 `async`, `postgres`, `tls-rustls`
- **Crate 依赖关系**: `api-server` depends on `domain` + `infrastructure`；`domain` 零外部依赖

## Project Structure

<!-- AI 生成指引：说明 src/ 目录组织，bin 与 lib 分工 -->
```
{project-name}/
├── crates/
│   ├── api-server/           # 可执行 crate: HTTP/gRPC 入口
│   │   └── src/
│   │       ├── main.rs
│   │       ├── routes/       # Axum/Actix 路由定义
│   │       ├── handlers/     # 请求处理函数
│   │       ├── middleware/   # 自定义中间件 (auth, request-id)
│   │       ├── extractors/   # 自定义 Axum extractor (Claims, DbPool)
│   │       └── error.rs      # HTTP error → Response 转换
│   ├── domain/               # 纯领域 crate: 实体、值对象、Repository trait
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── model/        # struct + enum (no ORM annotations)
│   │       └── repository.rs # Repository trait 定义 (async_trait)
│   ├── infrastructure/       # 基础设施实现
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── repository/   # Repository trait 实现 (sqlx/diesel)
│   │       ├── cache/
│   │       └── external/     # 第三方 API 客户端
│   └── shared/               # 共享工具、错误类型、Telemetry
│       └── src/
│           ├── lib.rs
│           └── error.rs
├── migrations/               # SQL 迁移 (sqlx-cli / refinery)
├── tests/                    # Integration tests (workspace 级)
├── examples/                 # 用法示例
├── benches/                  # Criterion benchmarks
├── Dockerfile
└── rust-toolchain.toml
```

## Framework Selection

<!-- AI 生成指引：根据项目需求和 async 运行时选择 -->
| 框架 | 适用场景 | 特点 |
|------|---------|------|
| axum | {高性能 REST API} | tokio 生态、类型安全 extractor、零额外依赖 |
| actix-web | {高并发 / 已成熟} | Actor 模型、内置中间件、独立运行时 |
| tide | {小型项目 / 学习} | async-std 生态、简洁 API |
| tonic | {gRPC 服务} | prost 生成、tower 中件间 |

- **选择**: `{axum|actix-web|tonic}`
- **Async Runtime**: `{tokio|async-std}` — tokio 为默认选择 (生态最大)

## Type-Driven Design

<!-- AI 生成指引：展示 Rust 特有的类型系统在架构中的运用 -->
- **Newtype Pattern**: 为关键值创建包装类型，防止混淆
  ```rust
  #[derive(Debug, Clone, PartialEq, Eq, Hash)]
  pub struct UserId(uuid::Uuid);

  #[derive(Debug, Clone)]
  pub struct Email(String);  // 构造时校验

  impl Email {
      pub fn new(s: &str) -> Result<Self, ValidationError> { ... }
  }
  ```
- **Enum State Machines**: 用枚举建模状态流转
  ```rust
  pub enum Order {
      Pending { items: Vec<LineItem> },
      Confirmed { items: Vec<LineItem>, confirmed_at: DateTime<Utc> },
      Shipped { tracking_number: String },
      Cancelled { reason: String },
  }
  ```
- **Zero-Cost Abstractions**: `Cow<str>` 避免无谓分配；`&str` vs `String` 按需使用
- **Trait Bounds**: 函数签名明确声明约束，不隐藏

## Error Handling

<!-- AI 生成指引：展示 thiserror + anyhow 的分层使用约定 -->
```rust
// domain crate — 用 thiserror 定义具体错误类型
#[derive(Debug, thiserror::Error)]
pub enum DomainError {
    #[error("user {0} not found")]
    NotFound(UserId),
    #[error("email {0} already taken")]
    EmailConflict(String),
    #[error("validation failed: {0}")]
    Validation(String),
}

// infrastructure crate — 实现 From<sqlx::Error> for DomainError
// api-server crate — anyhow::Result 或自定义 AppError → JSON response
impl From<DomainError> for axum::http::StatusCode {
    fn from(err: DomainError) -> Self {
        match err {
            DomainError::NotFound(_) => StatusCode::NOT_FOUND,
            DomainError::EmailConflict(_) => StatusCode::CONFLICT,
            DomainError::Validation(_) => StatusCode::UNPROCESSABLE_ENTITY,
        }
    }
}
```
- **库 crate (domain/infrastructure)**: 用 `thiserror`，返回 `Result<T, DomainError>`
- **二进制 crate (api-server)**: 可用 `anyhow::Result` 做快速原型；生产转向具体错误类型
- **原则**: 不吞掉错误，用 `?` 传播；wrap 添加上下文 (`with_context`)

## Async Runtime

<!-- AI 生成指引：说明 async 模式的使用约定 -->
- **Async Layer**: 仅 IO 密集层用 async (handler → repository boundary)
- **Sync Layer**: 纯计算 / Domain 逻辑用 sync，避免 `#[async_trait]` 污染
- **Database**: `sqlx` async 查询，`SqlitePool` / `PgPool` 连接池
- **Streams**: `tokio_stream` 处理流式响应 (SSE / 大文件)
- **Cancellation**: tokio `CancellationToken` 做优雅关闭，清理连接池

## Database

<!-- AI 生成指引：从 Cargo.toml 数据库依赖推导 -->
- **SQL 驱动**:
  - `sqlx` (编译时 SQL 检查，宏 `sqlx::query_as!` — 推荐)
  - `diesel` (查询构建器 + ORM，纯 Rust)
  - `sea-orm` (async ORM，类似 Active Record)
- **连接池**: `sqlx::PgPool` / `deadpool` (通用池)
- **编译时检查**: `sqlx::query!("SELECT * FROM users WHERE id = $1", id)` — CI 中 `SQLX_OFFLINE=true`
- **迁移**: `sqlx migrate run` 或 `refinery`，迁移文件在 `migrations/`
- **Repository 实现**:
  ```rust
  #[async_trait]
  impl UserRepository for PgUserRepository {
      async fn find_by_id(&self, id: UserId) -> Result<Option<User>, DomainError> { ... }
  }
  ```

## Testing

<!-- AI 生成指引：说明 Rust 多级测试策略 -->
- **Unit Tests** (inline `#[cfg(test)]`):
  ```rust
  #[cfg(test)]
  mod tests {
      use super::*;

      #[test]
      fn test_email_new_valid() {
          assert!(Email::new("user@example.com").is_ok());
      }

      #[tokio::test]
      async fn test_create_user() {
          let repo = MockUserRepository::new();
          // ...
      }
  }
  ```
- **Integration Tests** (`tests/` 目录 — 公共 API 测试):
  ```rust
  // tests/api_test.rs
  use crate_name::api;
  ```
- **Property Testing**: `proptest` 库测试不变量
- **HTTP 测试**: Axum `Router::oneshot` 不需要绑定端口
- **数据库测试**: `sqlx::test` 事务回滚 或 testcontainers
- **基准测试**: `criterion` 库 (`benches/`)

## Ownership & Memory

<!-- AI 生成指引：说明架构中的所有权模式选择 -->
- **Borrowing in Request Handlers**: Axum extractor 自动处理生命周期，handler 参数使用 owned types
- **共享状态**: `Arc<RwLock<T>>` 用于共享可变状态；`Arc<T>` 用于只读共享
- **App State**:
  ```rust
  #[derive(Clone)]
  struct AppState {
      db: PgPool,
      redis: RedisPool,
      config: Arc<AppConfig>,
  }
  ```
- **避免**: 避免过长的生命周期标注，优先使用 `Clone` + owned 数据
- **零拷贝**: 序列化/反序列化时优先 `&str`，无修改场景避免 `String` 分配

## Build Optimizations

<!-- AI 生成指引：从 Cargo.toml [profile.*] 配置推导 -->
```toml
[profile.release]
lto = true            # Link Time Optimization
codegen-units = 1     # 优化优于编译速度
opt-level = 3         # 最大优化
strip = "symbols"     # 减小二进制
```

## Observability

<!-- AI 生成指引：从 tracing 生态系统推导 -->
- **Structured Logging**: `tracing` crate (tracing spans + events)
  ```rust
  #[tracing::instrument(skip(pool), fields(user_id = %id))]
  async fn get_user(pool: &PgPool, id: UserId) -> Result<User, Error> {
      tracing::info!("fetching user");
      // ...
  }
  ```
- **Subscriber**: `tracing-subscriber` + `tracing-opentelemetry` 导出到 Jaeger/Datadog
- **Metrics**: `metrics` crate + `metrics-exporter-prometheus`
- **Error Tracking**: `sentry` 或 `sentry-tracing` 集成
- **Profiling**: `pprof` crate, `tokio-console` (async runtime 可视化)

## Security

<!-- AI 生成指引：Rust 特有的安全优势和安全考量 -->
- **内存安全**: Rust 编译器消除 UAF、double-free、buffer overflow — 但仍需关注业务逻辑安全
- **Unsafe 审计**: `#[forbid(unsafe_code)]`；若必须 unsafe，集中隔离 + 文档说明 + 审查
- **输入验证**: `validator` crate 或手写 validation；所有外部输入必须验证
- **SQL 注入**: sqlx 编译时参数化检查 — 无法拼接 SQL
- **依赖审计**: `cargo audit` (基于 RustSec Advisory DB) 在 CI 运行
- **Cargo.toml 锁定**: `Cargo.lock` 提交到仓库 (二进制项目)
- **TLS**: `rustls` (纯 Rust TLS 实现，无 OpenSSL 依赖)

## Status: draft
