<!-- TEMPLATE: typescript.md — TypeScript 项目架构设计模板 -->
<!-- 用途：l-feature / l-bugfix 的 design-architecture 子文档 -->
<!-- 位置：docs/plans/P{NNN}-{slug}/design-architecture.md -->
<!-- AI 生成指引：从 tech-stack.md 和 language-profile 推导，按以下结构完整填写 -->

# Design: 项目架构 (TypeScript)

> 子文档 of [design.md](design.md) | 本文档描述 TypeScript 项目的架构设计

## TypeScript Configuration

<!-- AI 生成指引：从 tsconfig.json 提取关键编译选项，说明每项的理由 -->
- **编译目标**: `{ES2022|ESNext}`
- **模块系统**: `{ESNext|NodeNext}` — 与 package.json type 字段一致
- **严格模式**: `strict: true` — 启用所有严格检查 (noImplicitAny, strictNullChecks, strictFunctionTypes, strictPropertyInitialization, noUncheckedIndexedAccess)
- **路径别名**:
  ```json
  "paths": {
    "@/*": ["./src/*"],
    "@shared/*": ["./packages/shared/src/*"]
  }
  ```
- **声明文件**: `.d.ts` 集中放在 `types/` 目录；第三方无类型包在 `types/*.d.ts` 声明
- **Source Maps**: `sourceMap: true`，生产环境使用 `inline-source-map` 或上传到错误追踪平台

## Build Pipeline

<!-- AI 生成指引：从 package.json scripts 推导构建流程 -->
- **开发运行**: `tsx` 或 `ts-node` 直接执行 (无需预编译)
- **生产构建**: `tsc --build` 输出到 `dist/`
- **构建步骤**: `tsc` → `tsc-alias` (解析路径别名) → `cp assets/ dist/`
- **类型检查**: `tsc --noEmit` 在 CI lint 阶段运行，独立于构建
- **Bundle**: 可选，Monorepo 使用 `tsup` / `esbuild` 打包服务入口

## Type System Design

<!-- AI 生成指引：说明项目的类型设计约定，而非 TypeScript 语法手册 -->
- **Interface vs Type**:
  - `interface` 用于公开 API (支持 declaration merging)
  - `type` 用于联合类型、映射类型、工具类型
- **泛型模式**:
  - Repository 模式: `interface Repository<T> { findById(id: string): Promise<T> }`
  - Result 模式: `type Result<T, E = AppError> = { success: true; data: T } | { success: false; error: E }`
- **Branded Types**: 为 ID、money、email 等关键值创建 nominal type 防止误用
  ```typescript
  type UserId = string & { __brand: 'UserId' }
  type Money = number & { __brand: 'Money' }
  ```
- **模板字面量类型**: `type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'`
- **类型守卫**: 每个 discriminated union 提供 isX() 类型守卫函数

## Dependency Injection

<!-- AI 生成指引：根据项目规模选择 DI 策略 -->
- **轻量方案** (小型项目): 模块级闭包 + 参数化工厂函数
  ```typescript
  // src/services/user.service.ts
  export const createUserService = (deps: { userRepo: UserRepository; logger: Logger }) => { ... }
  ```
- **容器方案** (中大型): `{tsyringe|inversify}` 装饰器注入
  ```typescript
  @injectable()
  class UserService {
    constructor(@inject('UserRepository') private userRepo: UserRepository) {}
  }
  ```
- **选择**: `{轻量工厂 / tsyringe / inversify}`
- **理由**: {团队规模 / 模块数 / 测试 mock 便利性}

## Monorepo Setup

<!-- AI 生成指引：仅当项目为 monorepo 时填写此节；否则标注 N/A -->
- **工具**: `{npm workspaces|yarn workspaces|pnpm workspaces|turborepo|nx}`
- **包结构**:
  ```
  packages/
  ├── shared/          # 共享类型、工具函数、常量
  ├── api-server/      # HTTP API 服务
  ├── worker/          # 后台任务处理
  └── web/             # 前端
  ```
- **共享类型**: `packages/shared/src/types/` — 所有包引用 `@project/shared`
- **版本策略**: 不独立发包时使用 `workspace:*` 协议

## Runtime & Framework

<!-- AI 生成指引：框架选择同 JS 模板，增加 TypeScript 特有的考量 -->
- **Node.js 版本**: `{18|20|22}`
- **框架**: `{Express (带 @types/express)|Fastify (原生 TypeScript 支持)|Koa}`
- **TypeScript 优先选择**: Fastify 原生支持 TypeScript + JSON Schema → 类型自动推导

## Layered Architecture (TypeScript Enhanced)

<!-- AI 生成指引：展示 TypeScript 如何在每层发挥类型优势 -->
```
[HTTP In] → Routes (zod parse → typed params) → Controllers (typed req/res)
                → Services (Result<T,E> return) → Repositories (generic<T> CRUD)
                    → DB/Cache
                → Error Handler (typed error discrimination)
```

- **类型安全验证**: Zod schema 不仅做运行时校验，还导出 `z.infer<typeof schema>` 用于编译时类型
- **Service 返回**: 统一使用 `Result<T, AppError>` 类型，禁止 throw 作为控制流
- **Controller 类型**: 使用 `Request<P, ResBody, ReqBody, ReqQuery>` 泛型约束参数类型

## Code Generation

<!-- AI 生成指引：列出自定义代码生成策略 -->
- **API 客户端**: 从 OpenAPI schema 生成类型安全的调用方 (openapi-typescript)
- **tRPC** (如使用): 服务端过程定义 → 客户端自动推导类型，无需手动维护 API 类型
- **数据库类型**: `kysely-codegen` 或 Prisma 从 schema 生成表类型
- **GraphQL**: GraphQL Codegen → TypeScript types + React hooks

## DI Patterns

<!-- AI 生成指引：说明 DI 的类型安全实现 -->
- **Token 系统**: 使用 Symbol 或 string literal union 作为 inject token
- **接口与实现分离**:
  ```typescript
  // types.ts — 纯接口定义，零运行时开销
  export interface IUserRepository {
    findById(id: UserId): Promise<User | null>;
  }
  // user.repository.ts — 实现
  export class PostgresUserRepository implements IUserRepository { ... }
  ```

## Testing

<!-- AI 生成指引：从 package.json devDependencies 和 jest.config.ts 推导 -->
- **测试框架**: `{vitest|jest}` — vitest 优先 (原生 ESM/TS 支持)
- **类型测试**: `expect-type` 或 `tsd` 验证复杂类型推断
- **Mock**: `vitest.mock` / `jest.mock` + `ts-auto-mock` 或 `factory.ts` 构建测试数据
- **HTTP 测试**: `supertest` + 类型化请求体
- **测试工厂**: 每个实体提供 factory 函数 (如 `createTestUser(overrides)`) 返回完整类型对象

## Error Handling (Type-Safe)

<!-- AI 生成指引：展示 Result 模式和 discriminated union 的错误处理 -->
```typescript
// 类型安全的错误处理，而非 try-catch 满天飞
type AppResult<T> = { ok: true; value: T } | { ok: false; error: AppError }

// 调用方
const result = await userService.createUser(input)
if (!result.ok) {
  return res.status(result.error.statusCode).json(result.error.toJSON())
}
return res.status(201).json(result.value)
```

## Performance

<!-- AI 生成指引：同 JS 模板性能节，增加 TypeScript 特有的 -->
- **同 JS 模板所有优化** (cluster, connection pool, caching)
- **TypeScript 构建优化**: `incremental: true` 加速 tsc，`projectReferences` 用于 monorepo 并行构建
- **Decorators 开销**: 注意 `emitDecoratorMetadata` 的运行时开销和包体积

## Monorepo Testing

<!-- AI 生成指引：仅 monorepo 填写 -->
- **单元测试**: 每个包独立运行 `vitest`
- **集成测试**: `api-server` 依赖 `shared` 的编译产物
- **CI 优化**: 利用 turbo/nx 缓存，仅测试变更包及其下游依赖

## Security

<!-- AI 生成指引：同 JS 安全节 + TypeScript 特有 -->
- **同 JS 模板所有安全措施** (helmet, rate-limit, input validation, CORS, audit)
- **类型安全防护**: 利用 TypeScript 的 `strict: true` 捕获 undefined/null 滥用
- **原型污染防护**: 使用 `Map` 代替 `{}` 存储用户数据；Object.create(null)
- **反序列化**: 对 `JSON.parse` 的输出用 Zod schema 校验，不信任解析结果

## Status: draft
