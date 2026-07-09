<!-- TEMPLATE: go.md — Go 项目架构设计模板 -->
<!-- 用途：l-feature / l-bugfix 的 design-architecture 子文档 -->
<!-- 位置：docs/plans/P{NNN}-{slug}/design-architecture.md -->
<!-- AI 生成指引：从 tech-stack.md 和 language-profile 推导，按以下结构完整填写 -->

# Design: 项目架构 (Go)

> 子文档 of [design.md](design.md) | 本文档描述 Go 项目的架构设计

## Go Version & Features

<!-- AI 生成指引：从 go.mod go 指令行提取版本 -->
- **Go 版本**: `{1.21|1.22|1.23}+`
- **关键特性利用**:
  - 1.21+: Generics (类型安全集合/Result 类型)，`slog` 结构化日志
  - 1.22+: `net/http` 路由增强 (`r.PathValue("id")`)、`for range` 整数循环
  - 1.23+: `iter` 迭代器模式

## Project Layout

<!-- AI 生成指引：参照 golang-standards/project-layout，说明目录职责 -->
```
{module-name}/
├── cmd/
│   └── {app-name}/
│       └── main.go           # 入口：依赖组装、启动 server
├── internal/                  # 私有包 (编译器强制不可外部导入)
│   ├── handler/              # HTTP/gRPC handler (controller)
│   │   ├── user_handler.go
│   │   └── user_handler_test.go  # 表驱动测试
│   ├── service/              # 业务逻辑层
│   ├── repository/           # 数据访问接口 + 实现
│   ├── model/                # 领域模型 (struct)
│   ├── middleware/            # HTTP 中间件 (auth, request-id, logging)
│   └── config/               # 配置加载 (envparse / viper)
├── pkg/                       # 可公开导入的库 (非本项目专用)
│   ├── apperror/             # 自定义错误类型
│   ├── pagination/           # 分页工具
│   └── ...
├── migrations/                # SQL 迁移 (golang-migrate)
├── api/                       # OpenAPI / Proto 定义
├── scripts/                   # 构建/部署脚本
├── Dockerfile
├── Makefile
├── go.mod
└── go.sum
```
- **`internal/` 强制私有**: 编译器阻止外部项目导入，保护内部实现
- **`pkg/` 可公开**: 提供库级 API，有稳定兼容性承诺

## Module System

<!-- AI 生成指引：从 go.mod 提取 module 路径和关键依赖 -->
- **Module 路径**: `{github.com/org/project}`
- **Workspace** (Monorepo 适用): `go.work` 文件定义 workspace 成员
  ```go
  go 1.22
  use (
      ./services/api-server
      ./services/worker
      ./pkg/shared
  )
  ```
- **Replace 指令**: 仅开发期使用 (`replace x => ../local-x`)，不提交到主分支
- **依赖版本**: `go get -u` 升级；`go mod tidy` 清理未用依赖

## Framework Selection

<!-- AI 生成指引：根据项目 need 选择 -->
| 框架 | 适用场景 | 特点 |
|------|---------|------|
| net/http (标准库) | 小型 / 高性能 API | 零依赖、完全控制、Go 1.22+ 自带路径参数路由 |
| chi | RESTful API | 轻量、标准接口、idiomatic Go |
| gin | 高性能 / 大团队 | 快速、验证绑定、大量中间件 |
| echo | 中型 Web 应用 | 内置中间件、简洁 API |

- **选择**: `{net/http|chi|gin|echo}`
- **理由**: {零依赖偏好 / 性能基准 / 团队经验 / 中间件生态}

## Layered Architecture

<!-- AI 生成指引：标注每层的包路径和关键接口 -->
```
HTTP Request → Middleware Chain (auth, request-id, slog, recovery)
    → Handler (internal/handler/ — HTTP 绑定: 解析 path/query/body, 调用 service, 写 response)
        → Service (internal/service/ — 接口 + 实现; 纯业务逻辑; 可 mock)
            → Repository (internal/repository/ — 接口 + 实现; 数据访问抽象)
                → Database (sql.DB / sqlx / sqlc)
    → Error Middleware (统一序列化 AppError → JSON)
    → Response (统一 JSON envelope: {data, error, meta})
```

- **Handler**: HTTP 关注点 (read body, validate input, call service, write status code)
- **Service**: 零 HTTP 依赖 — 参数和返回值都是 Go 类型
- **Repository**: 接口定义在 `internal/repository/`，实现在 `internal/repository/postgres/`

## Error Handling

<!-- AI 生成指引：展示 Go 惯用错误处理模式，与 Java/Python 不同 -->
```go
package apperror

// Sentinel errors — errors.Is() 使用
var (
    ErrNotFound       = errors.New("resource not found")
    ErrUnauthorized   = errors.New("unauthorized")
    ErrConflict       = errors.New("resource conflict")
)

// Custom error with context — errors.As() 使用
type AppError struct {
    Code    string `json:"code"`
    Message string `json:"message"`
    Err     error  `json:"-"`
}

func (e *AppError) Error() string { ... }
func (e *AppError) Unwrap() error { return e.Err }
```
- **Wrapping**: `fmt.Errorf("user lookup: %w", err)` — 保留错误链
- **检查**: `errors.Is(err, apperror.ErrNotFound)` + `errors.As(err, &appErr)`
- **Handler 转换**: Service 返回 sentinel error → Handler 映射到 HTTP status code
- **原则**: 不吞掉错误，每层向上 wrap 添加上下文；不 panic 除非初始化失败

## Context

<!-- AI 生成指引：说明 context.Context 在整个请求链中的传播约定 -->
- **请求级 Context**: 从 `r.Context()` 获取，沿 Handler → Service → Repository 传递
- **取消传播**: 客户端断开连接 → context 取消 → DB 查询/HTTP 调用被中断
- **超时设置**: 关键操作显式设置 timeout
  ```go
  ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
  defer cancel()
  ```
- **值传递**: 仅用于请求元数据 (requestId, userId)，不用于业务参数

## Concurrency

<!-- AI 生成指引：展示 goroutine/channel 的架构级使用约定 -->
- **Goroutine 生命周期管理**:
  - `errgroup.Group` 管理 goroutine 组，自动错误传播和取消
  ```go
  var g errgroup.Group
  g.Go(func() error { return userRepo.FindByID(ctx, id) })
  g.Go(func() error { return orderRepo.ListByUserID(ctx, id) })
  if err := g.Wait(); err != nil { ... }
  ```
- **Worker Pool**: CPU 密集任务用 `GOMAXPROCS` 限制 + buffered channel 排队
- **Channel 约定**: 创建方负责 close；nil channel 在 select 中永不就绪 (可用作条件禁用)
- **数据竞争**: CI 中运行 `go test -race` 检测竞争条件
- **并发原语**: 优先 `sync.Mutex` / `sync.RWMutex`；原子操作用 `sync/atomic`

## Testing

<!-- AI 生成指引：从 Makefile 和 _test.go 文件推导测试约定 -->
- **测试工具**: 标准 `testing` 包 + `testify` 断言库
- **表驱动测试** (must):
  ```go
  func TestUserService_Create(t *testing.T) {
      tests := []struct {
          name    string
          input   CreateUserInput
          wantErr bool
          want    User
      }{
          {"valid user", CreateUserInput{Name: "Alice"}, false, User{Name: "Alice"}},
          {"empty name", CreateUserInput{}, true, User{}},
      }
      for _, tt := range tests {
          t.Run(tt.name, func(t *testing.T) { ... })
      }
  }
  ```
- **Mock**: 手写 mock (实现 Service/Repository 接口) 或 `mockery` 自动生成
- **HTTP 测试**: `httptest.NewServer(handler)` — 不需要真实端口绑定
- **数据库测试**: testcontainers-go 启动 PostgreSQL 容器，运行真实迁移
- **测试分层**:
  - Unit: 内部包 `_test.go`，测试纯逻辑
  - Integration: `<package>_test` 外部测试包 + 容器化 DB
  - Benchmark: `func BenchmarkXxx(b *testing.B)`
- **覆盖率**: `go test -coverprofile=coverage.out`，CI 门槛 80%

## Database

<!-- AI 生成指引：从 go.mod 推导 DB 相关依赖 -->
- **连接池**: `sql.DB` 配置
  ```go
  db.SetMaxOpenConns(25)
  db.SetMaxIdleConns(10)
  db.SetConnMaxLifetime(5 * time.Minute)
  ```
- **查询**:
  - 原始 SQL: `sqlx` (命名参数、结构体映射)
  - 代码生成: `sqlc` (类型安全，从 SQL 文件生成 Go 代码) — 推荐
  - ORM: `gorm` (快速开发，但注意隐式行为)
- **迁移**: `golang-migrate/migrate` — `source: file://migrations`
- **事务**: 通过 `db.BeginTx(ctx)` 传递，Repository 方法接收 `*sql.Tx`

## Build & Deploy

<!-- AI 生成指引：从 Makefile 或 CI 配置推导 -->
```makefile
NAME = {app-name}
VERSION = $(shell git describe --tags --always --dirty)
LDFLAGS = -ldflags "-X main.version=$(VERSION) -X main.commit=$(shell git rev-parse HEAD)"

.PHONY: build
build:
    CGO_ENABLED=0 go build $(LDFLAGS) -o bin/$(NAME) ./cmd/$(NAME)/

.PHONY: test
test:
    go test -race -coverprofile=coverage.out ./...
```
- **编译**: 静态编译 (`CGO_ENABLED=0`)，单二进制分发
- **交叉编译**: `GOOS=linux GOARCH=amd64 go build ...`
- **容器**: Multi-stage Docker — builder (go build) → scratch/alpine runtime

## Observability

<!-- AI 生成指引：从 Go 项目惯用库推导 -->
- **结构化日志**: `log/slog` (标准库，Go 1.21+) 或 `zerolog` (性能优先)
  ```go
  slog.InfoContext(ctx, "user created", "userId", user.ID, "duration", time.Since(start))
  ```
- **Middleware 注入**: 在 middleware 中从 `context` 提取 traceId，存入 slog attributes
- **Metrics**: `prometheus/client_golang` 暴露 `/metrics` 端点
- **Tracing**: `otel` (OpenTelemetry) 跨服务传播 trace context
- **Profiling**: `net/http/pprof` (自带) + `go tool pprof -http=:6061`

## Security

<!-- AI 生成指引：Go 项目特有的安全考量 -->
- **输入验证**: `go-playground/validator` 或手写 validation 函数
- **SQL 注入**: 参数化查询 (sqlx `Named` / sqlc 编译时检查) — Go 无 ORM 隐式转义风险
- **请求体限制**: `http.MaxBytesReader` 防止大请求耗尽内存
- **超时**: `http.Server` 配置 `ReadTimeout` / `WriteTimeout` / `IdleTimeout`
- **依赖审计**: `govulncheck ./...` 在 CI 中运行
- **TLS**: 生产环境强制 HTTPS (`http.Server.TLSConfig`)

## Status: draft
