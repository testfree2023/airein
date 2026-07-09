<!-- TEMPLATE: go.md — Go 工程规范模板 -->
<!-- 用途：l-feature / l-bugfix 的 design-conventions 子文档 -->
<!-- 位置：docs/plans/P{NNN}-{slug}/design-conventions.md -->
<!-- AI 生成指引：基于 Go 社区最佳实践和团队约定填写 -->
# Design: 工程规范 (Go)
> 子文档 of [design.md](design.md) | 本文档定义 Go 项目的代码与工程规范
<!-- AI 生成指引：替换 {project_name}、{module_path}、{go_version}、{coverage_threshold}、{app_name}。 -->

## 1. 命名约定 (Naming)
| 对象 | 约定 | 示例 | 禁止 |
|---|---|---|---|
| package | 短小单词，小写 | `user`, `billing` | `user_service`, `common` |
| 文件 | snake_case 可接受 | `user_service.go` | `UserService.go` |
| exported | PascalCase | `CreateUser` | `create_User` |
| unexported | camelCase | `parseToken` | `parse_token` |
| 接口 | 行为 + er | `Reader`, `UserStore` | `IUserStore` |
| 错误变量 | `ErrXxx` | `ErrUserNotFound` | `UserNotFoundError` |
Go 使用 MixedCaps，不使用下划线命名（文件名例外）；package 不使用复数和泛名。

## 2. 代码风格 (Code Style)
Formatter: gofmt mandatory。Imports: goimports。Linter: golangci-lint。
```yaml
run:
  timeout: 5m
linters:
  enable: [errcheck, govet, staticcheck, gosec, revive, ineffassign, unused]
```
| DO | DON'T |
|---|---|
| 返回错误并处理 | 忽略 `err` |
| 小接口定义在消费方 | 提前设计巨大接口 |
| 组合优于复杂继承式嵌入 | 为复用状态嵌入无关 struct |

## 3. 目录结构 (Directory Layout)
```text
{project_name}/
├─ cmd/{app_name}/main.go  # 程序入口
├─ internal/               # 私有应用代码
│  ├─ domain/              # 纯业务类型
│  ├─ service/             # 用例编排
│  ├─ transport/           # HTTP/gRPC/CLI
│  └─ storage/             # DB 实现
├─ pkg/                    # 稳定外部库（谨慎）
├─ migrations/             # 数据库迁移
└─ go.mod
```
<!-- AI 生成指引：只有真正稳定的外部 API 才放 pkg；默认使用 internal。 -->

## 4. 导入规范 (Imports)
顺序：stdlib → external → internal；组间空行；goimports 自动整理。
```go
import (
    "context"
    "errors"
    "time"

    "github.com/jackc/pgx/v5"
    "go.uber.org/zap"

    "{module_path}/internal/domain"
)
```
禁止：点导入、未说明的 blank import、循环依赖。

## 5. 错误处理 (Error Handling)
错误是值；使用 `%w` 包装；库代码禁止 panic。
```go
var ErrUserNotFound = errors.New("user not found")

func (s *Service) GetUser(ctx context.Context, id UserID) (User, error) {
    user, err := s.store.FindUser(ctx, id)
    if err != nil {
        return User{}, fmt.Errorf("find user %s: %w", id, err)
    }
    return user, nil
}
```
| DO | DON'T |
|---|---|
| `errors.Is/As` 判断 | 字符串匹配错误 |
| 立即处理 `err` | `_ = riskyCall()` |

## 6. 日志规范 (Logging)
使用 `slog` (Go 1.21+) 或 zap；结构化 key-value；生产禁止 `log.Printf`。
```go
logger.InfoContext(ctx, "user created", "user_id", userID, "request_id", requestID)
logger.ErrorContext(ctx, "create user failed", "error", err, "request_id", requestID)
```
禁止记录密码、token、cookie、完整 PII；字段使用 snake_case。

## 7. 测试规范 (Testing)
测试文件与源码相邻：`*_test.go`；table-driven；覆盖率 `{coverage_threshold}` 默认 80%。
```go
func TestCalculateTotal(t *testing.T) {
    tests := []struct { name string; cart Cart; want int }{{"valid discount", Cart{Coupon: "SAVE10"}, 90}}
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            require.Equal(t, tt.want, CalculateTotal(tt.cart))
        })
    }
}
```
helper 调用 `t.Helper()`；`require` 用于前置条件，`assert` 用于多断言。

## 8. 注释与文档 (Comments & Docs)
每个 exported symbol 必须 Godoc，句子以名称开头。
```go
// CreateUser creates a user after validating domain invariants.
func CreateUser(ctx context.Context, input CreateUserInput) (User, error) { }
```
Context 是第一个参数；不要存入 struct；向下游传播 cancellation/deadline。

## 9. Git 规范
- 分支：`feature/{ticket}-{slug}`、`bugfix/{ticket}-{slug}`。
- Commit：Conventional Commits。
- PR：包含 `go test ./...`、覆盖率、race 检查（如并发代码）、风险说明。

## 10. Code Review checklist
- 是否所有 err 都处理并正确 `%w` 包装？
- library 是否存在 panic/log.Fatal/os.Exit？
- context 是否作为第一参数并传递？
- goroutine 是否有退出路径，channel 关闭语义是否清晰？

## 11. 性能规范 (Performance)
热路径必须 benchmark；使用 pprof 定位后优化。避免不必要 allocations，必要时使用 `sync.Pool`。
```go
func BenchmarkEncodeUser(b *testing.B) {
    for i := 0; i < b.N; i++ { _, _ = EncodeUser(sampleUser) }
}
```
工具：`go test -bench`、`pprof`、`go tool trace`、`benchstat`。

## 12. 依赖管理 (Dependencies)
- `go mod tidy` 必须 clean；提交 `go.mod` 和 `go.sum`。
- CI 运行 `govulncheck ./...`；使用 Dependabot/Renovate。
- 新依赖说明维护状态、API 稳定性、许可证。
