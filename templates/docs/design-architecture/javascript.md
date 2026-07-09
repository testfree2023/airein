<!-- TEMPLATE: javascript.md — JavaScript/Node.js 项目架构设计模板 -->
<!-- 用途：l-feature / l-bugfix 的 design-architecture 子文档 -->
<!-- 位置：docs/plans/P{NNN}-{slug}/design-architecture.md -->
<!-- AI 生成指引：从 tech-stack.md 和 language-profile 推导，按以下结构完整填写 -->

# Design: 项目架构 (JavaScript)

> 子文档 of [design.md](design.md) | 本文档描述 JavaScript/Node.js 项目的架构设计

## Runtime

<!-- AI 生成指引：从 package.json engines 字段或项目约定推导，说明版本选择理由 -->
- **Node.js 版本**: `{18|20|22}`
- **版本选择理由**: {LTS 稳定 / 新特性需求 (如 native fetch、ESM loader hooks) / 部署平台限制}
- **包管理器**: `{npm|yarn|pnpm}` — {选择理由：workspace 支持 / 安装速度 / lockfile 生态}

## Project Structure

<!-- AI 生成指引：从实际目录结构推导，说明每个目录的职责 -->
```
project-root/
├── src/                # 源代码主目录
│   ├── server.js       # HTTP server 入口
│   ├── app.js          # Express/Fastify/Koa app 工厂
│   ├── routes/         # 路由层：route 定义 + 请求校验 + 权限检查
│   ├── controllers/    # 控制器：参数转换、调用 service、构造响应
│   ├── services/       # 业务逻辑层：领域逻辑、外部 API 调用
│   ├── repositories/   # 数据访问层：DB 查询、缓存操作
│   ├── middleware/      # 自定义中间件 (auth, request-id, error-handler)
│   ├── models/         # 数据模型/验证 schema
│   ├── utils/          # 纯函数工具
│   └── config/         # 配置加载 (dotenv, per-environment)
├── tests/              # 测试目录
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── bin/                # CLI 入口脚本
├── migrations/         # DB 迁移文件
└── scripts/            # 运维/构建脚本
```

## Module System

<!-- AI 生成指引：检查 package.json type 字段 -->
- **模块格式**: `{ESM (type: "module")|CommonJS}`
- **ESM 注意事项**: {动态 import 用于可选依赖、__dirname 替代方案 (import.meta.url)、CJS 兼容层}
- **Package.json 关键字段**: `exports` 控制公开 API，`engines` 锁定 Node 版本，`type` 声明模块格式

## Framework Selection

<!-- AI 生成指引：根据项目规模和性能需求选择，列出对比和理由 -->
| 框架 | 适用场景 | 特点 |
|------|---------|------|
| Express | {中小型项目 / RESTful API} | 生态丰富、中间件多、学习曲线低 |
| Fastify | {高性能 API / 微服务} | 内置 schema validation、插件架构、低 overhead |
| Koa | {需要自定义中间件栈} | 轻量核心、async/await 原生、无内置路由 |

- **选择**: `{Express|Fastify|Koa}`
- **理由**: {性能基准 / 团队经验 / 生态依赖 / 插件需求}

## Layered Architecture

<!-- AI 生成指引：标注每层的核心文件和职责，箭头表示数据流方向 -->
```
Request → Middleware Stack → Routes → Controllers → Services → Repositories → DB/Cache
                                      ↓
                                  Models/Schemas (validation at boundary)
                                      ↓
                              Error Handler (centralized catch-all)
```

- **路由层**: 定义 HTTP method + path，绑定中间件链，调用控制器
- **控制器层**: 解析请求参数 (req.params, req.query, req.body)，调用 Service，格式化响应 (res.json)
- **服务层**: 纯业务逻辑，不依赖 req/res 对象；可被 HTTP、CLI、worker 复用
- **数据访问层**: 封装 DB 操作，返回业务对象而非原始查询结果；支持缓存层
- **中间件层**: 横切关注点 — auth、request-id、body parsing、compression、CORS

## Error Handling

<!-- AI 生成指引：说明错误分类策略和统一处理机制 -->
```
class AppError extends Error {
  constructor(message, statusCode, code) { ... }
}
class NotFoundError extends AppError { ... }
class ValidationError extends AppError { ... }
class UnauthorizedError extends AppError { ... }
```
- **错误类层次**: AppError (基类) → NotFoundError / ValidationError / UnauthorizedError / ConflictError
- **统一错误处理中间件**: 捕获所有抛出/next(err)，序列化为 `{ error: { code, message } }`
- **async 包装**: 使用 wrap(fn) 工具避免 try/catch 重复
- **错误序列化**: 生产环境不泄露 stack trace，开发环境保留

## Configuration

<!-- AI 生成指引：从 dotenv 文件或配置目录推导 -->
- **环境变量**: dotenv 加载 .env.{NODE_ENV}
- **配置分层**: `default.js` → `{environment}.js` → 环境变量覆盖
- **校验**: 启动时检查必须变量 (PORT, DATABASE_URL)，缺失即退出
- **敏感信息**: API keys、DB 密码仅通过环境变量注入，不提交到仓库

## Logging

<!-- AI 生成指引：从 package.json dependencies 推导日志库 -->
- **日志库**: `{winston|pino}`
- **日志级别**: `error` (告警) → `warn` (异常但可恢复) → `info` (关键业务事件) → `debug` (调试详情)
- **结构化日志**: JSON 格式，包含 requestId、userId、duration 等上下文
- **生产环境**: stdout 输出，由容器/日志系统收集；禁止 console.log

## Async Patterns

<!-- AI 生成指引：列出项目中的异步处理约定 -->
- **async/await**: 所有异步操作统一使用 async/await，禁止 callback
- **Promise 并发控制**: 使用 `Promise.allSettled` 处理批量操作，`p-limit` 控制并发数
- **CPU 密集型任务**: 使用 `worker_threads` 池 (如 `piscina`)，避免阻塞 event loop
- **Event loop 监控**: 使用 `toobusy-js` 或内置 `perf_hooks` 检测 event loop 延迟

## Testing

<!-- AI 生成指引：从 package.json devDependencies 推导测试栈 -->
- **测试框架**: `{jest|vitest|mocha}`
- **HTTP 测试**: `supertest` 启动 app 实例做集成测试
- **Mock 策略**: `jest.mock` 用于单元测试的 DB/外部 API
- **测试分层**:
  - Unit: 测试 service/utility 纯逻辑，不涉及 IO
  - Integration: supertest + 真实 DB (测试用)，测试完整请求链路
  - E2E: 针对已部署环境，验证关键用户路径
- **覆盖率**: ≥ 80%，CI 中 `--coverage` 检查

## Performance

<!-- AI 生成指引：根据部署规模推导优化策略 -->
- **Cluster 模式**: PM2 或 Node cluster 模块，fork worker 数 = CPU 核心数
- **Event loop 监控**: `eventLoopUtilization()` 或 `clinic.js` 诊断
- **内存**: `--max-old-space-size` 控制堆大小，`heapdump` 分析内存泄漏
- **连接池**: DB/Redis 连接池上限设为 worker 数 × 每 worker 连接数，避免耗尽
- **缓存策略**: Redis 用于热点数据，带 TTL，缓存穿透/击穿/雪崩保护

## Security

<!-- AI 生成指引：列出项目必须的安全中间件和策略 -->
- **HTTP 头安全**: helmet 中间件设置 CSP、HSTS、X-Frame-Options
- **速率限制**: `express-rate-limit` 或反向代理层限制
- **输入验证**: `joi` 或 `zod` schema 校验所有入参 (body/query/params)
- **SQL 注入防护**: 参数化查询 / ORM，禁止字符串拼接 SQL
- **依赖审计**: `npm audit` 在 CI 中运行，定期更新依赖
- **CORS**: 白名单 origin，禁止 `Access-Control-Allow-Origin: *` 生产环境

## Status: draft
