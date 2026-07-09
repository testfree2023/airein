<!-- TEMPLATE: rust.md — Rust 工程规范模板 -->
<!-- 用途：l-feature / l-bugfix 的 design-conventions 子文档 -->
<!-- 位置：docs/plans/P{NNN}-{slug}/design-conventions.md -->
<!-- AI 生成指引：基于 Rust 社区最佳实践和团队约定填写 -->
# Design: 工程规范 (Rust)
> 子文档 of [design.md](design.md) | 本文档定义 Rust 项目的代码与工程规范
<!-- AI 生成指引：替换 {project_name}、{crate_name}、{coverage_threshold}、{msrv}。 -->

## 1. 命名约定 (Naming)
| 对象 | 约定 | 示例 | 禁止 |
|---|---|---|---|
| crate/module | snake_case | `user_store` | `UserStore` |
| 函数/变量 | snake_case | `create_user` | `createUser` |
| 类型/trait | UpperCamelCase | `UserRepository` | `user_repository` |
| enum variant | UpperCamelCase | `PaymentFailed` | `PAYMENT_FAILED` |
| 常量/static | SCREAMING_SNAKE_CASE | `MAX_RETRY_COUNT` | `maxRetryCount` |
| feature flag | kebab-case | `postgres-store` | `postgres_store` |
Trait 名表达能力：`ReadUser`, `EncodeOrder`；避免 `Manager`/`Helper` 泛名。

## 2. 代码风格 (Code Style)
Formatter: rustfmt。Linter: clippy `-D warnings`；新代码启用 `clippy::pedantic` 并显式豁免。
```toml
# rustfmt.toml
edition = "2021"
max_width = 100
use_field_init_shorthand = true
use_try_shorthand = true
```
```toml
[lints.clippy]
all = "deny"
pedantic = "warn"
unwrap_used = "deny"
expect_used = "warn"
```
| DO | DON'T |
|---|---|
| 用类型表达状态 | 用字符串 flag 表达状态 |
| `?` 传播错误 | 大段 match 只为 rethrow |
| 借用优先，必要时 clone | 无脑 `.clone()` |

## 3. 目录结构 (Directory Layout)
```text
{project_name}/
├─ Cargo.toml
├─ src/
│  ├─ lib.rs           # library API
│  ├─ main.rs          # binary entry（如适用）
│  ├─ domain/          # 纯领域类型
│  ├─ application/     # 用例编排
│  ├─ infrastructure/  # DB/HTTP/FS 实现
│  └─ error.rs         # error types
├─ tests/              # integration tests
├─ benches/            # criterion benchmarks
└─ examples/           # public examples
```
<!-- AI 生成指引：workspace 项目需补充 crates/* 的 ownership 和 public API 边界。 -->

## 4. 导入规范 (Imports)
顺序：`std` → external crates → `crate::`；字母序；use blocks；禁止 glob import（prelude/tests 例外）。
```rust
use std::{collections::HashMap, time::Duration};
use anyhow::Context;
use tracing::{error, info};
use crate::{domain::UserId, error::AppError};
```
禁止：生产 `use foo::*`、跨模块导入 private 实现细节、循环模块依赖。

## 5. 错误处理 (Error Handling)
Library 使用 thiserror；binary 使用 anyhow。生产代码禁止 `unwrap()`。
```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("user not found: {id}")]
    UserNotFound { id: UserId },
    #[error("storage failed")]
    Storage(#[from] StorageError),
}
```
| DO | DON'T |
|---|---|
| `Result<T, AppError>` | panic 表达可恢复错误 |
| `.context("load config")?` | 丢失错误上下文 |

## 6. 日志规范 (Logging)
使用 tracing，结构化字段，span 表达请求/任务上下文；生产禁止 `println!`/`dbg!`。
```rust
info!(user_id = %user_id, request_id = %request_id, "user created");
error!(error = %err, request_id = %request_id, "create user failed");
```
禁止记录 secret、token、cookie、完整 PII。

## 7. 测试规范 (Testing)
单元测试放 `#[cfg(test)] mod tests`；集成测试放 `tests/`；不变量使用 proptest；覆盖率 `{coverage_threshold}` 默认 80%。
```rust
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn calculates_total_with_discount() {
        let total = calculate_total(&Cart::with_coupon("SAVE10"));
        assert_eq!(total, Money::from_cents(9000));
    }
}
```
错误路径、边界值、异步超时/取消必须测试。

## 8. 注释与文档 (Comments & Docs)
crate 文档用 `//!`；item 文档用 `///`；公共 API 示例必须通过 doctest。
```rust
/// Creates a user after validating domain invariants.
///
/// # Errors
/// Returns [`AppError::UserAlreadyExists`] when email is taken.
pub async fn create_user(input: CreateUserInput) -> Result<User, AppError> { }
```
Unsafe 必须有 `// SAFETY:` 注释，并封装在 safe API 后面。

## 9. Git 规范
- 分支：`feature/{ticket}-{slug}`、`bugfix/{ticket}-{slug}`。
- Commit：Conventional Commits。
- PR：包含 `cargo test`、`cargo clippy`、`cargo fmt --check`、benchmark（如热路径）。

## 10. Code Review checklist
- 是否存在生产 `unwrap()`、`dbg!`、`println!`？
- error enum 是否稳定、上下文是否足够？
- public API 是否有 rustdoc 和 Errors/Panics/Safety 段？
- unsafe 是否最小化并有 SAFETY 注释？

## 11. 性能规范 (Performance)
避免：热路径 `Box<dyn>`、无必要 clone、频繁分配临时 String、锁跨 await。
```rust
fn bench_encode(c: &mut criterion::Criterion) {
    c.bench_function("encode_user", |b| b.iter(|| encode_user(&sample_user())));
}
```
工具：criterion、cargo flamegraph、heaptrack、`tracing` timings。

## 12. 依赖管理 (Dependencies)
- workspace 依赖版本集中管理，必要时 exact versions。
- CI 运行 `cargo deny` 和 `cargo audit`。
- 新依赖说明许可证、MSRV、维护状态、feature flags。
- 禁止默认开启过多 features；用 `default-features = false` 后显式开启。
